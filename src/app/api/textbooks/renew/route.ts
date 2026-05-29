export const dynamic = "force-dynamic";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { auditLog } from "@/lib/logger";
import { apiSuccess, apiError } from "@/lib/api-response";

const RENEW_PRICES: Record<number, number> = {
  30: 0.3,   // 续借1个月 = 基准价30%
  90: 0.65,  // 续借1学期 = 基准价65%
  120: 0.85, // 续借标准学期 = 基准价85%
};

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return apiError("请先登录", 401);

  const body = await req.json();
  const { copyId, extendDays = 30 } = body;
  if (!copyId) return apiError("缺少副本ID");
  if (![30, 90, 120].includes(extendDays)) return apiError("续借时长仅支持30/90/120天");

  const copy = await db.textbookCopy.findUnique({
    where: { id: copyId },
    include: { textbook: true },
  });
  if (!copy) return apiError("书籍副本不存在");
  if (copy.borrowerId !== session.userId) return apiError("这不是您借阅的书籍");
  if (copy.status !== "borrowed") return apiError("该书籍当前状态不允许续借");

  // 续借费用：按比例计算
  const plans = await db.subscriptionPlan.findMany({ where: { status: "active" }, take: 1 });
  const basePrice = plans.length > 0 ? Math.ceil(plans[0].price / plans[0].maxBooks) : 30;
  const multiplier = RENEW_PRICES[extendDays] || 0.3;
  const renewFee = Math.round(basePrice * multiplier);

  const newDueDate = new Date((copy.dueDate || new Date()).getTime() + extendDays * 24 * 60 * 60 * 1000);

  const result = await db.$transaction(async (tx: any) => {
    // 事务内读取余额（防止 TOCTOU）
    const wallet = await tx.wallet.findUnique({ where: { userId: session.userId } });
    if (!wallet || wallet.balance < renewFee) {
      throw new Error(`INSUFFICIENT_BALANCE:${wallet?.balance || 0}`);
    }

    await tx.textbookCopy.update({
      where: { id: copyId },
      data: { dueDate: newDueDate },
    });

    await tx.wallet.update({
      where: { userId: session.userId },
      data: { balance: wallet.balance - renewFee },
    });

    await tx.walletTransaction.create({
      data: {
        walletId: wallet.id,
        type: "pay",
        amount: -renewFee,
        balanceBefore: wallet.balance,
        balanceAfter: wallet.balance - renewFee,
        method: "wallet",
        status: "success",
      },
    });

    await tx.inventoryTransaction.create({
      data: {
        copyId,
        fromStatus: "borrowed",
        toStatus: "borrowed",
        operatorId: session.userId,
        detail: `续借${extendDays}天，费用 ¥${renewFee}，新应还：${newDueDate.toLocaleDateString("zh-CN")}`,
      },
    });
  }).catch((err: Error) => {
    if (err.message.startsWith("INSUFFICIENT_BALANCE")) {
      const balance = err.message.split(":")[1];
      return { error: `钱包余额不足，续借需要 ¥${renewFee}，当前余额 ¥${balance}` };
    }
    throw err;
  });

  if (result && "error" in result) return apiError(result.error);

  await auditLog({
    userId: session.userId,
    action: "textbook_renew",
    targetType: "textbook",
    targetId: copyId,
    detail: `续借《${copy.textbook.title}》${extendDays}天，费用 ¥${renewFee}，新应还：${newDueDate.toLocaleDateString("zh-CN")}`,
  });

  return apiSuccess({
    message: `续借成功，新应还日期：${newDueDate.toLocaleDateString("zh-CN")}`,
    renewFee,
    newDueDate,
    extendDays,
  });
}
