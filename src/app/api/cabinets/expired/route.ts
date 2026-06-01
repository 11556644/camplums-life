import { db } from "@/lib/db";
import { auditLog, domainEvent } from "@/lib/logger";
import { apiSuccess, apiError } from "@/lib/api-response";
import { canTransition, ORDER_STATUS } from "@/lib/order-state-machine";
import { onOrderCancelled } from "@/lib/settlement";
import { calculateOvertimeFee } from "@/lib/pricing";

// 扫描并处理过期柜格
// - 交易订单（trade）：超时按 ¥0.5/小时 计费，不释放柜格
// - 寄存订单（storage）：超时强制释放
export async function POST(req: Request) {
  // Cron secret 认证（必须配置 CRON_SECRET 才能调用）
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return apiError("服务未配置定时任务密钥", 500);
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) return apiError("未授权", 401);

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

    let overtimeProcessed = 0;
    let forceReleased = 0;

    for (const binding of expiredBindings) {
      const isTrade = binding.depositType === "trade" && binding.orderId;

      if (isTrade) {
        // 交易订单：超时计费模式
        const overtimeMs = now.getTime() - new Date(binding.expiresAt!).getTime();
        const overtimeMinutes = Math.ceil(overtimeMs / (60 * 1000));

        // 上次已计费的超时时长（从 durationHours 推算原始时长）
        const originalMinutes = (binding.durationHours || 2) * 60;
        const totalElapsedMinutes = originalMinutes + overtimeMinutes;

        // 已收的预付费用
        const alreadyPaid = binding.prepaidFee || 0;
        // 总应收费用（预付 + 超时）
        const overtimeFee = calculateOvertimeFee(overtimeMinutes);
        const totalDue = alreadyPaid + overtimeFee;
        const newCharge = overtimeFee; // 本次新增费用

        if (newCharge > 0) {
          // 从卖家钱包扣超时费
          let sellerWallet = await db.wallet.findUnique({ where: { userId: binding.order!.sellerId } });
          if (!sellerWallet) {
            sellerWallet = await db.wallet.create({
              data: { userId: binding.order!.sellerId, schoolId: binding.order!.schoolId, balance: 0 },
            });
          }

          if (sellerWallet.balance >= newCharge) {
            // 扣费成功，延长 expiresAt 1 小时（事务内操作防 TOCTOU）
            await db.$transaction(async (tx) => {
              const freshWallet = await tx.wallet.findUnique({ where: { id: sellerWallet.id } });
              if (!freshWallet || freshWallet.balance < newCharge) return;
              const newBal = freshWallet.balance - newCharge;
              await tx.wallet.update({ where: { id: freshWallet.id }, data: { balance: newBal } });
              await tx.walletTransaction.create({
              data: {
                walletId: sellerWallet.id, type: "overtime_fee", amount: -newCharge,
                balanceBefore: sellerWallet.balance, balanceAfter: newBal,
                orderId: binding.orderId, method: "wallet", status: "success",
              },
              });
            }); // end 

            // 延长 1 小时
            const newExpiry = new Date(now.getTime() + 60 * 60 * 1000);
            await db.cabinetSlotOrder.update({
              where: { id: binding.id },
              data: {
                expiresAt: newExpiry,
                prepaidFee: totalDue,
              },
            });

            await db.cabinetSlotLog.create({
              data: {
                slotId: binding.slotId,
                action: "overtime_charged",
                operatorId: binding.depositorId,
                detail: `超时${overtimeMinutes}分钟，扣费¥${newCharge}，延长至${newExpiry.toLocaleTimeString("zh-CN")}，累计费用¥${totalDue}`,
              },
            });

            // 通知卖家
            await db.message.create({
              data: {
                schoolId: binding.order!.schoolId,
                receiverId: binding.order!.sellerId,
                type: "notification",
                title: "智能柜超时扣费",
                content: `取件码 ${binding.pickupCode} 已超时${overtimeMinutes}分钟，本次扣费 ¥${newCharge}，已延长1小时。请提醒买家尽快取件。`,
              },
            });

            overtimeProcessed++;
          } else {
            // 余额不足，强制释放柜格 + 取消订单
            await forceReleaseBinding(db, binding, `余额不足（需¥${newCharge}，余额¥${sellerWallet.balance}），柜格已释放`);
            forceReleased++;
          }
        }
      } else {
        // 寄存订单：超时直接释放
        await forceReleaseBinding(db, binding, "寄存超时，柜格已释放");
        forceReleased++;
      }
    }

    return apiSuccess({
      overtimeProcessed,
      forceReleased,
      message: `超时计费 ${overtimeProcessed} 个，强制释放 ${forceReleased} 个`,
    });
  } catch {
    return apiError("处理过期柜格失败", 500);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function forceReleaseBinding(db: any, binding: any, reason: string) {
  await db.$transaction(async (tx: any) => {
    await tx.cabinetSlotOrder.update({
      where: { id: binding.id },
      data: { status: "expired" },
    });

    await tx.cabinetSlot.update({
      where: { id: binding.slotId },
      data: { status: "empty" },
    });

    await tx.cabinetSlotLog.create({
      data: {
        slotId: binding.slotId,
        action: "expired",
        detail: `取件码 ${binding.pickupCode}：${reason}`,
      },
    });

    // 通知存件人
    const schoolId = binding.slot?.cabinet?.schoolId || binding.order?.schoolId || "";
    await tx.message.create({
      data: {
        schoolId,
        receiverId: binding.depositorId,
        type: "notification",
        title: "智能柜取件超时",
        content: `您的物品（取件码：${binding.pickupCode}）${reason}`,
      },
    });

    // 如果有关联订单，取消并退款
    if (binding.orderId && binding.order) {
      await tx.message.create({
        data: {
          schoolId: binding.order.schoolId,
          receiverId: binding.order.buyerId,
          type: "notification",
          title: "取件超时提醒",
          content: `订单 ${binding.order.orderNo} 的智能柜取件已超时，柜格已释放。`,
        },
      });

      if (binding.order.status === ORDER_STATUS.PAID && canTransition(binding.order.orderType, binding.order.status, ORDER_STATUS.CANCELLED)) {
        const prevStatus = binding.order.status;
        await tx.order.update({
          where: { id: binding.orderId! },
          data: { status: ORDER_STATUS.CANCELLED, cancelledAt: new Date() },
        });
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

    await tx.auditLog.create({
      data: {
        schoolId,
        action: "cabinet_expired", targetType: "cabinet", targetId: binding.slotId,
        detail: `取件码 ${binding.pickupCode}：${reason}`,
      },
    });
  });
}
