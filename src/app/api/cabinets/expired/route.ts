import { db } from "@/lib/db";
import { auditLog, domainEvent } from "@/lib/logger";
import { apiSuccess, apiError } from "@/lib/api-response";
import { canTransition, ORDER_STATUS } from "@/lib/order-state-machine";
import { onOrderCancelled } from "@/lib/settlement";

// 扫描并处理过期柜格（可由定时任务或手动调用）
export async function POST(req: Request) {
  // Cron secret 认证
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) return apiError("未授权", 401);
  }

  try {
    const now = new Date();
    const expiredBindings = await db.cabinetSlotOrder.findMany({
      where: {
        status: "active",
        expiresAt: { lt: now },
      },
      include: {
        slot: { include: { cabinet: true } },
        order: true,
      },
    });

    let processed = 0;

    for (const binding of expiredBindings) {
      await db.$transaction(async (tx: any) => {
        // 标记过期
        await tx.cabinetSlotOrder.update({
          where: { id: binding.id },
          data: { status: "expired" },
        });

        // 释放柜格
        await tx.cabinetSlot.update({
          where: { id: binding.slotId },
          data: { status: "empty" },
        });

        // 记录日志
        await tx.cabinetSlotLog.create({
          data: {
            slotId: binding.slotId,
            action: "expired",
            detail: `取件码 ${binding.pickupCode} 已过期，柜格已释放`,
          },
        });

        // 通知存件人
        const cabinetSchoolId = binding.slot?.cabinet?.schoolId || binding.order?.schoolId || "";
        await tx.message.create({
          data: {
            schoolId: cabinetSchoolId,
            receiverId: binding.depositorId,
            type: "notification",
            title: "智能柜取件超时",
            content: `您的物品（取件码：${binding.pickupCode}）已超时未被取件，柜格已释放。如需帮助请联系管理员。`,
          },
        });

        // 如果有关联订单，通知买家并自动退款
        if (binding.orderId && binding.order) {
          await tx.message.create({
            data: {
              schoolId: binding.order.schoolId,
              receiverId: binding.order.buyerId,
              type: "notification",
              title: "取件超时提醒",
              content: `订单 ${binding.order.orderNo} 的智能柜取件已超时，请联系卖家或管理员处理。`,
            },
          });

          // 已支付订单自动取消退款
          if (binding.order.status === ORDER_STATUS.PAID && canTransition(binding.order.orderType, binding.order.status, ORDER_STATUS.CANCELLED)) {
            const prevStatus = binding.order.status;
            await tx.order.update({
              where: { id: binding.orderId! },
              data: { status: ORDER_STATUS.CANCELLED, cancelledAt: new Date() },
            });
            // 统一取消副作用（退款、商品恢复、教材释放）
            await onOrderCancelled({ tx, order: binding.order, userId: binding.order.buyerId, prevStatus });

            await tx.message.create({
              data: {
                schoolId: binding.order.schoolId, receiverId: binding.order.buyerId,
                type: "notification", title: "订单已自动退款",
                content: `订单 ${binding.order.orderNo} 因取件超时已自动取消，¥${binding.order.totalAmount} 已退还到钱包。`,
              },
            });
          }
        }

        // 审计日志
        await tx.auditLog.create({
          data: {
            schoolId: binding.order?.schoolId || binding.slot?.cabinet?.schoolId || "",
            action: "cabinet_expired", targetType: "cabinet", targetId: binding.slotId,
            detail: `取件码 ${binding.pickupCode} 过期，柜格已释放`,
          },
        });
      });

      processed++;
    }

    return apiSuccess({ processed, message: `处理了 ${processed} 个过期柜格` });
  } catch {
    return apiError("处理过期柜格失败", 500);
  }
}
