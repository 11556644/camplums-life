export const dynamic = "force-dynamic";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/api-helpers";
import { auditLog } from "@/lib/logger";
import { apiSuccess, apiError } from "@/lib/api-response";

// 获取当前用户的订阅列表
export const GET = withAuth(async (req, session) => {
  const subscriptions = await db.subscriptionOrder.findMany({
    where: { userId: session.userId },
    include: {
      plan: true,
      order: { select: { id: true, orderNo: true, status: true, totalAmount: true, deposit: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return apiSuccess(subscriptions);
});

// 取消订阅
export const PATCH = withAuth(async (req, session) => {
  const body = await req.json();
  const { subscriptionId, action } = body; // action: cancel

  if (action !== "cancel") return apiError("无效操作");

  const sub = await db.subscriptionOrder.findUnique({
    where: { id: subscriptionId },
    include: { order: true },
  });
  if (!sub) return apiError("订阅不存在", 404);
  if (sub.userId !== session.userId) return apiError("无权操作", 403);
  if (sub.status !== "active" && sub.status !== "pending") return apiError("当前状态不允许取消");

  await db.$transaction(async (tx: any) => {
    await tx.subscriptionOrder.update({
      where: { id: subscriptionId },
      data: { status: "cancelled" },
    });

    // 归还所有借阅中的教材
    await tx.textbookCopy.updateMany({
      where: { borrowerId: session.userId, status: "borrowed" },
      data: { status: "sanitizing", borrowerId: null, borrowedAt: null, dueDate: null },
    });

    // 退还押金到钱包
    if (sub.order && sub.order.deposit && sub.order.deposit > 0) {
      const wallet = await tx.wallet.findUnique({ where: { userId: session.userId } });
      if (wallet) {
        await tx.wallet.update({
          where: { userId: session.userId },
          data: { balance: wallet.balance + sub.order.deposit },
        });
        await tx.walletTransaction.create({
          data: {
            walletId: wallet.id,
            type: "refund",
            amount: sub.order.deposit,
            balanceBefore: wallet.balance,
            balanceAfter: wallet.balance + sub.order.deposit,
            method: "wallet",
            status: "success",
          },
        });
      }
    }
  });

  await auditLog({
    userId: session.userId,
    action: "subscription_cancel",
    targetType: "subscription",
    targetId: subscriptionId,
    detail: `取消订阅，退还押金 ¥${sub.order?.deposit || 0}`,
  });

  return apiSuccess({ message: "订阅已取消，押金已退还" });
});
