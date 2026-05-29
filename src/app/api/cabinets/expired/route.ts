import { db } from "@/lib/db";
import { auditLog, domainEvent } from "@/lib/logger";
import { apiSuccess, apiError } from "@/lib/api-response";

// 扫描并处理过期柜格（可由定时任务或手动调用）
export async function POST() {
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
        const cabinetSchoolId = binding.slot?.cabinet?.schoolId || "school_001";
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

          // 已支付订单自动退款
          if (binding.order.status === "paid") {
            await tx.order.update({
              where: { id: binding.orderId! },
              data: { status: "cancelled", cancelledAt: new Date() },
            });
            const wallet = await tx.wallet.findUnique({ where: { userId: binding.order.buyerId } });
            if (wallet) {
              await tx.wallet.update({
                where: { userId: binding.order.buyerId },
                data: { balance: wallet.balance + binding.order.totalAmount },
              });
              await tx.walletTransaction.create({
                data: {
                  walletId: wallet.id, type: "refund", amount: binding.order.totalAmount,
                  balanceBefore: wallet.balance, balanceAfter: wallet.balance + binding.order.totalAmount,
                  orderId: binding.orderId, method: "auto", status: "success",
                },
              });
            }
            await tx.message.create({
              data: {
                schoolId: binding.order.schoolId, receiverId: binding.order.buyerId,
                type: "notification", title: "订单已自动退款",
                content: `订单 ${binding.order.orderNo} 因取件超时已自动取消，¥${binding.order.totalAmount} 已退还到钱包。`,
              },
            });

            // 恢复商品上架
            const orderItems = await tx.orderItem.findMany({ where: { orderId: binding.orderId! } });
            for (const item of orderItems) {
              if (item.productId) {
                await tx.product.update({ where: { id: item.productId }, data: { status: "active" } });
              }
            }

            // 释放教材副本（subscription 订单）
            if (binding.order.orderType === "subscription") {
              for (const item of orderItems) {
                if (item.textbookId) {
                  const reservedCopies = await tx.textbookCopy.findMany({
                    where: { textbookId: item.textbookId, borrowerId: binding.order.buyerId, status: { in: ["reserved", "borrowed"] } },
                  });
                  for (const copy of reservedCopies) {
                    await tx.textbookCopy.update({
                      where: { id: copy.id },
                      data: { status: "available", borrowerId: null, borrowedAt: null, dueDate: null },
                    });
                    await tx.inventoryTransaction.create({
                      data: {
                        copyId: copy.id, fromStatus: copy.status, toStatus: "available",
                        detail: `柜格过期自动释放`,
                      },
                    });
                  }
                }
              }
            }
          }
        }

        // 审计日志
        await tx.auditLog.create({
          data: {
            schoolId: binding.order?.schoolId || "school_001",
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
