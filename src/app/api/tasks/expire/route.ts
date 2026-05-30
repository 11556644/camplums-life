import { db } from "@/lib/db";
import { auditLog, domainEvent, logger } from "@/lib/logger";
import { apiSuccess, apiError } from "@/lib/api-response";
import { canTransition, ORDER_STATUS } from "@/lib/order-state-machine";
import { onOrderCompleted, onOrderCancelled } from "@/lib/settlement";

const PAYMENT_TIMEOUT_MS = 30 * 60 * 1000; // 30 分钟
const PUBLISHER_CONFIRM_TIMEOUT_MS = 30 * 60 * 1000; // 30 分钟

export async function POST(req: Request) {
  // Cron secret 认证
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) return apiError("未授权", 401);
  }

  const now = new Date();
  let autoCancelled = 0;
  let deadlineNotified = 0;
  let autoCompleted = 0;

  // ========== Case 1: assigned + 订单超时未支付 → 自动取消，释放任务 ==========
  const pendingTasks = await db.task.findMany({
    where: {
      status: "assigned",
      acceptedAt: { not: null, lt: new Date(now.getTime() - PAYMENT_TIMEOUT_MS) },
    },
    include: {
      orderItems: { include: { order: true } },
    },
  });

  for (const task of pendingTasks) {
    // 找到关联的 pending_payment 订单
    const pendingOrder = task.orderItems.find(
      (item: any) => item.order.status === "pending_payment"
    )?.order;
    if (!pendingOrder) continue;

    await db.$transaction(async (tx: any) => {
      // 状态机校验
      if (!canTransition(pendingOrder.orderType, pendingOrder.status, ORDER_STATUS.CANCELLED)) {
        logger.warn("Task auto-cancel skipped: invalid transition", { orderId: pendingOrder.id, status: pendingOrder.status });
        return;
      }

      const prevStatus = pendingOrder.status;
      await tx.order.update({
        where: { id: pendingOrder.id },
        data: { status: ORDER_STATUS.CANCELLED, cancelledAt: new Date() },
      });

      // 释放任务回 open
      await tx.task.update({
        where: { id: task.id },
        data: {
          status: "open",
          assigneeId: null,
          acceptedAt: null,
          executionDeadline: null,
        },
      });

      // 统一取消副作用（退款等）
      await onOrderCancelled({ tx, order: pendingOrder, userId: task.publisherId, prevStatus });

      // 通知接单人
      await tx.message.create({
        data: {
          schoolId: task.schoolId,
          senderId: null,
          receiverId: pendingOrder.sellerId,
          type: "notification",
          title: "任务接单已超时",
          content: `您接单的「${task.title}」因发布者超时，已自动取消。`,
        },
      });

      // 通知发布者
      await tx.message.create({
        data: {
          schoolId: task.schoolId,
          senderId: null,
          receiverId: task.publisherId,
          type: "notification",
          title: "任务接单已超时取消",
          content: `您发布的「${task.title}」因超时，已自动取消接单，任务已重新开放。`,
        },
      });
    });

    autoCancelled++;
    logger.info("Task auto-cancelled (payment timeout)", { taskId: task.id });
  }

  // ========== Case 2: in_progress + 执行截止时间已过 → 通知双方，不自动完成 ==========
  const overdueTasks = await db.task.findMany({
    where: {
      status: "in_progress",
      executionDeadline: { lt: now },
    },
  });

  for (const task of overdueTasks) {
    // 双向通知（幂等：检查是否已通知过——用一条简单的消息检查）
    const existingNotification = await db.message.findFirst({
      where: {
        schoolId: task.schoolId,
        receiverId: task.publisherId,
        type: "notification",
        title: "任务执行已超时",
        content: { contains: task.id },
      },
    });
    if (existingNotification) continue;

    await db.$transaction(async (tx: any) => {
      await tx.message.create({
        data: {
          schoolId: task.schoolId,
          senderId: null,
          receiverId: task.publisherId,
          type: "notification",
          title: "任务执行已超时",
          content: `您发布的「${task.title}」（${task.id}）已超过执行截止时间，请联系服务方确认进度。`,
        },
      });

      if (task.assigneeId) {
        await tx.message.create({
          data: {
            schoolId: task.schoolId,
            senderId: null,
            receiverId: task.assigneeId,
            type: "notification",
            title: "任务执行已超时",
            content: `您接单的「${task.title}」已超过执行截止时间，请尽快完成或联系发布者协商。`,
          },
        });
      }
    });

    deadlineNotified++;
    logger.info("Task execution deadline notified", { taskId: task.id });
  }

  // ========== Case 3: supplierDoneAt 已设置 + 发布者 30 分钟未确认 → 自动完成 ==========
  const supplierDoneTasks = await db.task.findMany({
    where: {
      status: "in_progress",
      supplierDoneAt: { not: null, lt: new Date(now.getTime() - PUBLISHER_CONFIRM_TIMEOUT_MS) },
    },
    include: {
      orderItems: { include: { order: true } },
    },
  });

  for (const task of supplierDoneTasks) {
    const activeOrder = task.orderItems.find(
      (item: any) => item.order.status !== "cancelled" && item.order.status !== "completed"
    )?.order;
    if (!activeOrder) continue;

    await db.$transaction(async (tx: any) => {
      await tx.task.update({
        where: { id: task.id },
        data: { status: "completed" },
      });

      if (!canTransition(activeOrder.orderType, activeOrder.status, ORDER_STATUS.COMPLETED)) {
        logger.warn("Task auto-complete skipped: invalid order transition", { orderId: activeOrder.id, status: activeOrder.status });
        return;
      }

      await tx.order.update({
        where: { id: activeOrder.id },
        data: { status: ORDER_STATUS.COMPLETED, completedAt: now },
      });

      // 统一完成副作用（结算、信用分、通知）
      await onOrderCompleted({ tx, order: activeOrder, userId: task.publisherId });

      // 通知双方
      await tx.message.create({
        data: {
          schoolId: task.schoolId,
          senderId: null,
          receiverId: task.publisherId,
          type: "notification",
          title: "任务已自动确认完成",
          content: `您发布的「${task.title}」因服务方标记完成超过 30 分钟未确认，已自动完成。`,
        },
      });

      if (task.assigneeId) {
        await tx.message.create({
          data: {
            schoolId: task.schoolId,
            senderId: null,
            receiverId: task.assigneeId,
            type: "notification",
            title: "任务已自动确认完成",
            content: `您接单的「${task.title}」已被系统自动确认完成。`,
          },
        });
      }
    });

    autoCompleted++;
    logger.info("Task auto-completed (publisher confirm timeout)", { taskId: task.id });
  }

  return apiSuccess({
    autoCancelled,
    deadlineNotified,
    autoCompleted,
    total: autoCancelled + deadlineNotified + autoCompleted,
  });
}
