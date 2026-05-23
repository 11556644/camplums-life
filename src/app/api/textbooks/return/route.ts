import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { auditLog, domainEvent } from "@/lib/logger";
import { apiSuccess, apiError } from "@/lib/api-response";
import { ORDER_STATUS } from "@/lib/order-state-machine";

// 归还教材
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return apiError("请先登录", 401);

  const body = await req.json();
  const { copyId } = body;
  if (!copyId) return apiError("缺少副本ID");

  const copy = await db.textbookCopy.findUnique({
    where: { id: copyId },
    include: { textbook: true },
  });
  if (!copy) return apiError("教材副本不存在");
  if (copy.borrowerId !== session.userId) return apiError("这不是您借阅的教材");
  if (copy.status !== "borrowed") return apiError("该教材当前状态不允许归还");

  // 自动查找关联订单
  const user = await db.user.findUnique({ where: { id: session.userId } });
  const orderId = await db.orderItem.findFirst({
    where: { textbookId: copy.textbookId, order: { buyerId: session.userId, status: { in: ["paid", "in_progress"] } } },
    select: { orderId: true },
  }).then((r: { orderId: string } | null) => r?.orderId || null);

  // 计算逾期费
  let lateFee = 0;
  const now = new Date();
  if (copy.dueDate && now > copy.dueDate) {
    const overdueDays = Math.ceil((now.getTime() - copy.dueDate.getTime()) / (1000 * 60 * 60 * 24));
    const configs = await db.schoolConfig.findMany({
      where: { schoolId: user!.schoolId, key: { in: ["late_fee_per_day"] } },
    });
    const feePerDay = parseFloat(configs.find((c: { key: string; value: string }) => c.key === "late_fee_per_day")?.value || "2");
    lateFee = overdueDays * feePerDay;
  }

  const result = await db.$transaction(async (tx: any) => {
    // 标记为待消毒
    await tx.textbookCopy.update({
      where: { id: copyId },
      data: {
        status: "sanitizing",
        borrowerId: null,
        borrowedAt: null,
        dueDate: null,
      },
    });

    // 写入库存流转记录
    await tx.inventoryTransaction.create({
      data: {
        copyId,
        fromStatus: "borrowed",
        toStatus: "sanitizing",
        operatorId: session.userId,
        detail: `归还入库，逾期费：¥${lateFee}`,
      },
    });

    return { lateFee, copy };
  });

  // 如果有逾期费，从钱包扣除
  if (lateFee > 0) {
    const wallet = await db.wallet.findUnique({ where: { userId: session.userId } });
    if (wallet && wallet.balance >= lateFee) {
      await db.$transaction(async (tx: any) => {
        await tx.wallet.update({
          where: { userId: session.userId },
          data: { balance: wallet.balance - lateFee },
        });
        await tx.walletTransaction.create({
          data: {
            walletId: wallet.id,
            type: "pay",
            amount: -lateFee,
            balanceBefore: wallet.balance,
            balanceAfter: wallet.balance - lateFee,
            method: "wallet",
            status: "success",
          },
        });
      });
      // 逾期扣信用分
      const cs = await db.creditScore.findUnique({ where: { userId: session.userId } });
      if (cs) await db.creditScore.update({ where: { userId: session.userId }, data: { score: Math.max(0, cs.score - 2) } });

      await db.message.create({
        data: {
          schoolId: user!.schoolId, receiverId: session.userId,
          type: "notification", title: "逾期费已扣除",
          content: `您归还的《${copy.textbook.title}》逾期 ${Math.ceil((now.getTime() - (copy.dueDate?.getTime() || 0)) / (1000 * 60 * 60 * 24))} 天，已从钱包扣除 ¥${lateFee}，信用分 -2。`,
        },
      });
    } else {
      // 余额不足，记录欠款并通知
      await db.message.create({
        data: {
          schoolId: user!.schoolId, receiverId: session.userId,
          type: "notification", title: "逾期费待补缴",
          content: `您归还的《${copy.textbook.title}》产生逾期费 ¥${lateFee}，钱包余额不足（¥${wallet?.balance || 0}），请尽快充值，系统将在充值后自动扣除。`,
        },
      });
      // 记录待扣款（写入 WalletTransaction 为 pending 状态）
      if (wallet) {
        await db.walletTransaction.create({
          data: {
            walletId: wallet.id, type: "pay", amount: -lateFee,
            balanceBefore: wallet.balance, balanceAfter: wallet.balance,
            method: "pending", status: "pending",
          },
        });
      }
    }
  }

  // 检查是否所有副本都已归还，自动完成订单
  if (orderId) {
    const orderItems = await db.orderItem.findMany({
      where: { orderId },
    });
    const textbookIds = orderItems.filter((i) => i.textbookId).map((i) => i.textbookId!);
    if (textbookIds.length > 0) {
      const stillBorrowed = await db.textbookCopy.count({
        where: { textbookId: { in: textbookIds }, borrowerId: session.userId, status: "borrowed" },
      });
      if (stillBorrowed === 0) {
        await db.order.update({
          where: { id: orderId },
          data: { status: ORDER_STATUS.COMPLETED, completedAt: new Date() },
        });
      }
    }
  }

  await auditLog({
    userId: session.userId,
    action: "textbook_return",
    targetType: "textbook",
    targetId: copyId,
    detail: `归还《${copy.textbook.title}》，逾期费 ¥${lateFee}`,
  });

  return apiSuccess({ message: "归还成功，教材进入消毒流程", lateFee });
}
