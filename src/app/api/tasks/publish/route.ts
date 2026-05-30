import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { auditLog } from "@/lib/logger";
import { apiSuccess, apiError } from "@/lib/api-response";
import { getCreditPermissions } from "@/lib/credit";
import { generateOrderNo, ORDER_STATUS } from "@/lib/order-state-machine";
import { broadcastEvent } from "@/lib/realtime";
import { z } from "zod";

const schema = z.object({
  title: z.string().min(1).max(100),
  description: z.string().min(1),
  type: z.string().min(1),
  budget: z.number().nullable().optional(),
  budgetType: z.string().default("fixed"),
  location: z.string().optional(),
  deadline: z.coerce.date().optional(),
  executionMinutes: z.number().int().min(30).max(1440).default(120),
});

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return apiError("请先登录", 401);

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0].message);

  const user = await db.user.findUnique({ where: { id: session.userId } });
  if (!user) return apiError("用户不存在");

  const perms = await getCreditPermissions(session.userId);
  if (!perms.canPublish) return apiError("信用分不足，无法发布任务");

  const budget = parsed.data.budget ?? null;
  if (!budget || budget <= 0) return apiError("请填写任务金额");

  // 预付模式：发布时即从钱包扣款
  const result = await db.$transaction(async (tx: any) => {
    // 余额检查 + 扣款
    const wallet = await tx.wallet.findUnique({ where: { userId: session.userId } });
    if (!wallet || wallet.balance < budget) {
      throw new Error("BALANCE_INSUFFICIENT");
    }

    const newBalance = wallet.balance - budget;
    await tx.wallet.update({ where: { id: wallet.id }, data: { balance: newBalance } });
    await tx.walletTransaction.create({
      data: {
        walletId: wallet.id, type: "pay", amount: -budget,
        balanceBefore: wallet.balance, balanceAfter: newBalance,
        method: "wallet", status: "success",
      },
    });

    // 创建任务
    const task = await tx.task.create({
      data: {
        schoolId: user.schoolId,
        publisherId: session.userId,
        title: parsed.data.title,
        description: parsed.data.description,
        type: parsed.data.type,
        budget,
        budgetType: parsed.data.budgetType,
        location: parsed.data.location,
        deadline: parsed.data.deadline ?? null,
        executionMinutes: parsed.data.executionMinutes,
      },
    });

    // 创建订单（已支付，sellerId 暂用 publisherId 占位，接单时更新）
    const orderNo = generateOrderNo();
    const order = await tx.order.create({
      data: {
        orderNo,
        schoolId: user.schoolId,
        buyerId: session.userId,
        sellerId: session.userId, // 占位，接单时更新为真正的接单者
        orderType: "task",
        bizType: "market",
        status: ORDER_STATUS.PAID,
        totalAmount: budget,
        paidAt: new Date(),
        note: `任务预付：${parsed.data.title}`,
      },
    });

    await tx.orderItem.create({
      data: {
        orderId: order.id,
        taskId: task.id,
        quantity: 1,
        unitPrice: budget,
        totalPrice: budget,
      },
    });

    await tx.payment.create({
      data: {
        orderId: order.id, amount: budget, method: "wallet", status: "success",
        transactionId: `TASK_PREPAY_${crypto.randomUUID()}`,
        paidAt: new Date(),
      },
    });

    return { task, orderNo, newBalance };
  }).catch((err: Error) => {
    if (err.message === "BALANCE_INSUFFICIENT") return null;
    throw err;
  });

  if (!result) return apiError("钱包余额不足，请先充值");

  await auditLog({
    userId: session.userId,
    action: "task_publish",
    targetType: "task",
    targetId: result.task.id,
    detail: `发布任务「${result.task.title}」，预付 ¥${budget}，订单 ${result.orderNo}`,
  });

  broadcastEvent({
    type: "task",
    action: "created",
    targetId: result.task.id,
    userId: session.userId,
    data: { title: result.task.title, budget },
  });

  return apiSuccess({ task: result.task, prepaid: budget, balance: result.newBalance });
}
