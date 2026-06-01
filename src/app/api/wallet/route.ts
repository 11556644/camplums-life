import { db } from "@/lib/db";
import { withAuth } from "@/lib/api-helpers";
import { auditLog, domainEvent } from "@/lib/logger";
import { apiSuccess, apiError } from "@/lib/api-response";
import { canTransition, ORDER_STATUS } from "@/lib/order-state-machine";
import { onPaymentSettled } from "@/lib/settlement";
import { walletTopupSchema, walletPaySchema, walletRefundSchema } from "@/lib/schemas";

export const dynamic = "force-dynamic";

// 允许的充值金额（防刷大额）
const ALLOWED_TOPUP_AMOUNTS = [10, 20, 50, 100, 200, 500];
const MAX_TOPUP_PER_DAY = 2000;

export const GET = withAuth(async (req, session) => {
  let wallet = await db.wallet.findUnique({
    where: { userId: session.userId },
    include: { transactions: { orderBy: { createdAt: "desc" }, take: 20 } },
  });

  if (!wallet) {
    const user = await db.user.findUnique({ where: { id: session.userId }, select: { schoolId: true } });
    wallet = await db.wallet.create({
      data: { userId: session.userId, schoolId: user?.schoolId || session.schoolId || "", balance: 0 },
      include: { transactions: true },
    });
  }

  return apiSuccess(wallet);
});

export const POST = withAuth(async (req, session) => {
  const currentUser = await db.user.findUnique({ where: { id: session.userId }, select: { schoolId: true } });
  const schoolId = currentUser?.schoolId || session.schoolId || "";

  const body = await req.json();
  const { action } = body;

  // === 充值 ===
  if (action === "topup") {
    const parsed = walletTopupSchema.safeParse(body);
    if (!parsed.success) return apiError(parsed.error.issues[0].message);

    const { amount, method } = parsed.data;

    // 额外业务校验：充值金额必须在允许列表中
    if (!ALLOWED_TOPUP_AMOUNTS.includes(amount)) {
      return apiError(`充值金额必须是以下之一：${ALLOWED_TOPUP_AMOUNTS.join(", ")}`);
    }

    // 每日充值限额检查
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTopups = await db.walletTransaction.aggregate({
      where: {
        wallet: { userId: session.userId },
        type: "topup",
        status: "success",
        createdAt: { gte: today },
      },
      _sum: { amount: true },
    });
    if ((todayTopups._sum.amount || 0) + amount > MAX_TOPUP_PER_DAY) {
      return apiError(`每日充值限额 ¥${MAX_TOPUP_PER_DAY}，今日已充 ¥${todayTopups._sum.amount || 0}`);
    }

    const wallet = await db.wallet.upsert({
      where: { userId: session.userId },
      create: { userId: session.userId, schoolId, balance: amount },
      update: { balance: { increment: amount } },
    });

    await db.walletTransaction.create({
      data: {
        walletId: wallet.id, type: "topup", amount,
        balanceBefore: wallet.balance - amount, balanceAfter: wallet.balance,
        method, status: "success",
      },
    });

    await auditLog({ userId: session.userId, action: "wallet_topup", targetType: "wallet", targetId: wallet.id, detail: `充值 ¥${amount} via ${method}` });
    return apiSuccess({ balance: wallet.balance });
  }

  // === 支付 ===
  if (action === "pay") {
    const parsed = walletPaySchema.safeParse(body);
    if (!parsed.success) return apiError(parsed.error.issues[0].message);

    const { amount, orderId } = parsed.data;

    const order = await db.order.findUnique({ where: { id: orderId } });
    if (!order) return apiError("订单不存在");
    if (order.buyerId !== session.userId) return apiError("无权支付此订单");
    if (Math.abs(order.totalAmount - amount) > 0.01) return apiError("支付金额与订单不匹配");
    if (!canTransition(order.orderType, order.status, ORDER_STATUS.PAID)) return apiError(`订单状态不允许支付`);

    // 余额检查 + 扣款在事务内原子完成（防竞态）
    const result = await db.$transaction(async (tx: any) => {
      const w = await tx.wallet.findUnique({ where: { userId: session.userId } });
      if (!w || w.balance < amount) return null;

      const newBalance = w.balance - amount;
      await tx.wallet.update({ where: { id: w.id }, data: { balance: newBalance } });
      await tx.walletTransaction.create({
        data: {
          walletId: w.id, type: "pay", amount: -amount,
          balanceBefore: w.balance, balanceAfter: newBalance,
          orderId, method: "wallet", status: "success",
        },
      });
      await tx.order.update({ where: { id: orderId }, data: { status: ORDER_STATUS.PAID, paidAt: new Date() } });
      await tx.payment.create({
        data: {
          orderId, amount, method: "wallet", status: "success",
          transactionId: `WALLET_${crypto.randomUUID()}`,
          paidAt: new Date(),
        },
      });
      const paidOrder = await tx.order.findUnique({ where: { id: orderId } });
      if (paidOrder) await onPaymentSettled({ tx, order: paidOrder, userId: session.userId });
      return newBalance;
    });

    if (result === null) return apiError("余额不足");
    await domainEvent({ userId: session.userId, eventType: "wallet.paid", aggregateType: "wallet", aggregateId: session.userId, payload: { amount, orderId } });
    return apiSuccess({ balance: result });
  }

  // === 退款（仅系统内部调用，需关联有效订单） ===
  if (action === "refund") {
    const parsed = walletRefundSchema.safeParse(body);
    if (!parsed.success) return apiError(parsed.error.issues[0].message);

    const { orderId, amount } = parsed.data;

    const order = await db.order.findUnique({ where: { id: orderId } });
    if (!order) return apiError("订单不存在");
    if (order.buyerId !== session.userId) return apiError("无权退款此订单");
    if (order.status !== ORDER_STATUS.PAID) return apiError("订单状态不允许退款（当前：" + order.status + "）");
    if (amount > order.totalAmount) return apiError("退款金额不能超过订单金额");

    // 事务内：重复检查 + 余额更新 + 记录（防 TOCTOU）
    const result = await db.$transaction(async (tx: any) => {
      const existingRefund = await tx.walletTransaction.findFirst({
        where: { orderId, type: "refund", status: "success" },
      });
      if (existingRefund) return null;

      const w = await tx.wallet.findUnique({ where: { userId: session.userId } });
      if (!w) return null;

      const newBalance = w.balance + amount;
      await tx.wallet.update({ where: { id: w.id }, data: { balance: newBalance } });
      await tx.walletTransaction.create({
        data: {
          walletId: w.id, type: "refund", amount,
          balanceBefore: w.balance, balanceAfter: newBalance,
          orderId, method: "wallet", status: "success",
        },
      });
      return newBalance;
    });

    if (result === null) return apiError("该订单已退款或钱包不存在");
    await auditLog({ userId: session.userId, action: "wallet_refund", targetType: "wallet", targetId: orderId, detail: `退款 ¥${amount} 订单 ${order.orderNo}` });
    return apiSuccess({ balance: result });
  }

  return apiError("无效操作");
});
