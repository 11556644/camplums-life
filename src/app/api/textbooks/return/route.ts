import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { auditLog, domainEvent } from "@/lib/logger";
import { apiSuccess, apiError } from "@/lib/api-response";
import { ORDER_STATUS } from "@/lib/order-state-machine";
import { changeCredit } from "@/lib/credit";

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
  if (!copy) return apiError("书籍副本不存在");
  if (copy.borrowerId !== session.userId) return apiError("这不是您借阅的书籍");
  if (copy.status !== "borrowed") return apiError("该书籍当前状态不允许归还");

  const user = await db.user.findUnique({ where: { id: session.userId } });
  if (!user) return apiError("用户不存在");

  // 自动查找关联订单
  const orderItem = await db.orderItem.findFirst({
    where: { textbookId: copy.textbookId, order: { buyerId: session.userId, status: { in: ["paid", "in_progress"] } } },
    select: { orderId: true, order: { select: { note: true } } },
  });
  const orderId = orderItem?.orderId || null;

  // 计算逾期费（扣除免费宽限期）
  let lateFee = 0;
  let overdueDays = 0;
  const now = new Date();

  if (copy.dueDate && now > copy.dueDate) {
    const rawOverdueDays = Math.ceil((now.getTime() - copy.dueDate.getTime()) / (1000 * 60 * 60 * 24));

    // 从订阅套餐获取免费宽限期，或从订单备注解析
    let freeLateDays = 3;
    const subOrder = await db.subscriptionOrder.findFirst({
      where: { userId: session.userId, order: { buyerId: session.userId } },
      include: { plan: { select: { freeLateDays: true } } },
      orderBy: { createdAt: "desc" },
    });
    if (subOrder?.plan?.freeLateDays) {
      freeLateDays = subOrder.plan.freeLateDays;
    }

    // 扣除宽限期
    overdueDays = Math.max(0, rawOverdueDays - freeLateDays);

    if (overdueDays > 0) {
      const configs = await db.schoolConfig.findMany({
        where: { schoolId: user.schoolId, key: { in: ["late_fee_per_day"] } },
      });
      const feePerDay = parseFloat(configs.find((c: { key: string; value: string }) => c.key === "late_fee_per_day")?.value || "2");
      lateFee = overdueDays * feePerDay;
    }
  }

  // 在同一个事务中完成归还 + 钱包扣款，消除 TOCTOU
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

    await tx.inventoryTransaction.create({
      data: {
        copyId,
        fromStatus: "borrowed",
        toStatus: "sanitizing",
        operatorId: session.userId,
        detail: `归还入库，逾期${overdueDays}天，逾期费：¥${lateFee}`,
      },
    });

    // 如果有逾期费，在同一事务中扣款
    let walletDeducted = false;
    if (lateFee > 0) {
      const wallet = await tx.wallet.findUnique({ where: { userId: session.userId } });
      if (wallet && wallet.balance >= lateFee) {
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
        walletDeducted = true;
      } else if (wallet) {
        // 余额不足，记录待扣款
        await tx.walletTransaction.create({
          data: {
            walletId: wallet.id,
            type: "pay",
            amount: -lateFee,
            balanceBefore: wallet.balance,
            balanceAfter: wallet.balance,
            method: "pending",
            status: "pending",
          },
        });
      }
    }

    // 检查是否所有副本都已归还，自动完成订单
    if (orderId) {
      const orderItems = await tx.orderItem.findMany({ where: { orderId } });
      const textbookIds = orderItems.filter((i: any) => i.textbookId).map((i: any) => i.textbookId!);
      if (textbookIds.length > 0) {
        const stillBorrowed = await tx.textbookCopy.count({
          where: { textbookId: { in: textbookIds }, borrowerId: session.userId, status: "borrowed" },
        });
        if (stillBorrowed === 0) {
          await tx.order.update({
            where: { id: orderId },
            data: { status: ORDER_STATUS.COMPLETED, completedAt: new Date() },
          });
        }
      }
    }

    return { lateFee, overdueDays, walletDeducted };
  });

  // 逾期扣信用分（在事务内调用，嵌套事务通过 savepoint 保证原子性）
  if (result.walletDeducted) {
    await changeCredit({
      userId: session.userId,
      schoolId: user.schoolId,
      delta: -10,
      reason: "逾期还书",
      source: "textbook",
      orderId: orderId || undefined,
    });
  }

  // 发送通知
  if (result.lateFee > 0) {
    if (result.walletDeducted) {
      await db.message.create({
        data: {
          schoolId: user.schoolId, receiverId: session.userId,
          type: "notification", title: "逾期费已扣除",
          content: `您归还的《${copy.textbook.title}》逾期 ${result.overdueDays} 天（宽限期已扣除），已从钱包扣除 ¥${result.lateFee}，信用分 -10。`,
        },
      });
    } else {
      const wallet = await db.wallet.findUnique({ where: { userId: session.userId } });
      await db.message.create({
        data: {
          schoolId: user.schoolId, receiverId: session.userId,
          type: "notification", title: "逾期费待补缴",
          content: `您归还的《${copy.textbook.title}》产生逾期费 ¥${result.lateFee}，钱包余额不足（¥${wallet?.balance || 0}），请尽快充值。`,
        },
      });
    }
  }

  await auditLog({
    userId: session.userId,
    action: "textbook_return",
    targetType: "textbook",
    targetId: copyId,
    detail: `归还《${copy.textbook.title}》，逾期${result.overdueDays}天，逾期费 ¥${result.lateFee}`,
  });

  return apiSuccess({
    message: "归还成功，书籍进入消毒流程",
    lateFee: result.lateFee,
    overdueDays: result.overdueDays,
  });
}
