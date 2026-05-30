/**
 * 统一钱包操作 — 所有余额变更必须通过此模块
 * 禁止直接 UPDATE wallet.balance
 */

import { db } from "./db";

interface WalletOpContext {
  tx: any; // Prisma transaction client
  userId: string;
  amount: number;
  orderId?: string;
  method?: string;
}

/** 扣款（买家支付） */
export async function debitWallet({ tx, userId, amount, orderId, method = "wallet" }: WalletOpContext) {
  const wallet = await tx.wallet.findUnique({ where: { userId } });
  if (!wallet || wallet.balance < amount) {
    throw new Error("BALANCE_INSUFFICIENT");
  }

  const newBalance = wallet.balance - amount;
  await tx.wallet.update({ where: { id: wallet.id }, data: { balance: newBalance } });
  await tx.walletTransaction.create({
    data: {
      walletId: wallet.id, type: "pay", amount: -amount,
      balanceBefore: wallet.balance, balanceAfter: newBalance,
      orderId: orderId || null, method, status: "success",
    },
  });

  return newBalance;
}

/** 入账（卖家结算 / 退款 / 充值） */
export async function creditWallet({ tx, userId, amount, orderId, method = "wallet", type = "refund" }: WalletOpContext & { type?: string }) {
  const wallet = await tx.wallet.findUnique({ where: { userId } });
  if (!wallet) throw new Error("WALLET_NOT_FOUND");

  const newBalance = wallet.balance + amount;
  await tx.wallet.update({ where: { id: wallet.id }, data: { balance: newBalance } });
  await tx.walletTransaction.create({
    data: {
      walletId: wallet.id, type, amount,
      balanceBefore: wallet.balance, balanceAfter: newBalance,
      orderId: orderId || null, method, status: "success",
    },
  });

  return newBalance;
}
