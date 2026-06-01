export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { canTransition, ORDER_STATUS } from "@/lib/order-state-machine";
import { onOrderCancelled, onOrderCompleted } from "@/lib/settlement";
import { resetMonthlyCounts } from "@/lib/credit";

// 统一定时任务端点，由 Railway cron 调度
// 所有子任务在同一请求中顺序执行，失败不阻塞后续任务

export async function POST(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }
  }

  const results: Record<string, unknown> = {};
  const now = new Date();

  // ===== 1. 订单超时未支付自动取消（5 分钟）=====
  try {
    const timeout = 5 * 60 * 1000;
    const staleOrders = await db.order.findMany({
      where: {
        status: ORDER_STATUS.PENDING_PAYMENT,
        createdAt: { lt: new Date(now.getTime() - timeout) },
        orderType: { in: ["product", "task"] },
      },
    });

    let orderCancelled = 0;
    for (const order of staleOrders) {
      try {
        await db.$transaction(async (tx: any) => {
          if (!canTransition(order.orderType, order.status, ORDER_STATUS.CANCELLED)) return;
          const prevStatus = order.status;
          await tx.order.update({
            where: { id: order.id },
            data: { status: ORDER_STATUS.CANCELLED, cancelledAt: now },
          });
          await onOrderCancelled({ tx, order, userId: order.buyerId, prevStatus });
        });
        orderCancelled++;
      } catch (e) {
        logger.error("Order auto-cancel failed", { orderId: order.id, error: String(e) });
      }
    }
    results.orderCancelled = orderCancelled;
  } catch (e) {
    results.orderCancelError = String(e);
  }

  // ===== 2. 任务过期处理（单次查询合并两种条件）=====
  try {
    const TASK_TIMEOUT = 30 * 60 * 1000;
    const timeoutDate = new Date(now.getTime() - TASK_TIMEOUT);

    const expiredTasks = await db.task.findMany({
      where: {
        OR: [
          { status: "assigned", acceptedAt: { not: null, lt: timeoutDate } },
          { status: "in_progress", supplierDoneAt: { not: null, lt: timeoutDate } },
        ],
      },
      include: { orderItems: { include: { order: true } } },
    });

    let taskCancelled = 0;
    let taskCompleted = 0;

    for (const task of expiredTasks) {
      if (task.status === "assigned") {
        // Case A: assigned + 超时未支付 → 取消
        const pendingOrder = task.orderItems.find((i: any) => i.order.status === ORDER_STATUS.PENDING_PAYMENT)?.order;
        if (!pendingOrder) continue;
        try {
          await db.$transaction(async (tx: any) => {
            if (!canTransition(pendingOrder.orderType, pendingOrder.status, ORDER_STATUS.CANCELLED)) return;
            const prevStatus = pendingOrder.status;
            await tx.order.update({ where: { id: pendingOrder.id }, data: { status: ORDER_STATUS.CANCELLED, cancelledAt: now } });
            await tx.task.update({ where: { id: task.id }, data: { status: "open", assigneeId: null, acceptedAt: null, executionDeadline: null } });
            await onOrderCancelled({ tx, order: pendingOrder, userId: task.publisherId, prevStatus });
          });
          taskCancelled++;
        } catch (e) {
          logger.error("Task auto-cancel failed", { taskId: task.id, error: String(e) });
        }
      } else if (task.status === "in_progress") {
        // Case B: supplierDoneAt + 30 分钟未确认 → 自动完成
        const activeOrder = task.orderItems.find((i: any) => !["cancelled", "completed"].includes(i.order.status))?.order;
        if (!activeOrder) continue;
        try {
          await db.$transaction(async (tx: any) => {
            if (!canTransition(activeOrder.orderType, activeOrder.status, ORDER_STATUS.COMPLETED)) return;
            await tx.task.update({ where: { id: task.id }, data: { status: "completed" } });
            await tx.order.update({ where: { id: activeOrder.id }, data: { status: ORDER_STATUS.COMPLETED, completedAt: now } });
            await onOrderCompleted({ tx, order: activeOrder, userId: task.publisherId });
          });
          taskCompleted++;
        } catch (e) {
          logger.error("Task auto-complete failed", { taskId: task.id, error: String(e) });
        }
      }
    }
    results.taskCancelled = taskCancelled;
    results.taskCompleted = taskCompleted;
  } catch (e) {
    results.taskExpireError = String(e);
  }

  // ===== 3. 柜格过期处理 =====
  try {
    const expiredBindings = await db.cabinetSlotOrder.findMany({
      where: { status: "active", expiresAt: { lt: now } },
      include: { slot: { include: { cabinet: true } }, order: true },
    });

    let cabinetProcessed = 0;
    for (const binding of expiredBindings) {
      try {
        await db.$transaction(async (tx: any) => {
          await tx.cabinetSlotOrder.update({ where: { id: binding.id }, data: { status: "expired" } });
          await tx.cabinetSlot.update({ where: { id: binding.slotId }, data: { status: "empty" } });

          if (binding.orderId && binding.order?.status === ORDER_STATUS.PAID &&
              canTransition(binding.order.orderType, binding.order.status, ORDER_STATUS.CANCELLED)) {
            const prevStatus = binding.order.status;
            await tx.order.update({ where: { id: binding.orderId }, data: { status: ORDER_STATUS.CANCELLED, cancelledAt: now } });
            await onOrderCancelled({ tx, order: binding.order, userId: binding.order.buyerId, prevStatus });
          }
        });
        cabinetProcessed++;
      } catch (e) {
        logger.error("Cabinet expire failed", { bindingId: binding.id, error: String(e) });
      }
    }
    results.cabinetProcessed = cabinetProcessed;
  } catch (e) {
    results.cabinetExpireError = String(e);
  }

  // ===== 4. 信用月度重置（每月 1 日执行）=====
  try {
    if (now.getDate() === 1) {
      await resetMonthlyCounts();
      results.creditReset = true;
    }
  } catch (e) {
    results.creditResetError = String(e);
  }

  logger.info("Cron completed", results);
  return NextResponse.json({ success: true, results });
}
