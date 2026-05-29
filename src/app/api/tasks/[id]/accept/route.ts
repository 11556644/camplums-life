import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { auditLog, domainEvent } from "@/lib/logger";
import { apiSuccess, apiError } from "@/lib/api-response";
import { generateOrderNo, ORDER_STATUS } from "@/lib/order-state-machine";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return apiError("请先登录", 401);

  const { id } = await params;
  const body = await req.json();
  const { price } = body;

  const user = await db.user.findUnique({ where: { id: session.userId } });
  if (!user) return apiError("用户不存在");

  const finalPrice = price ?? 0;

  const orderNo = generateOrderNo();

  const result = await db.$transaction(async (tx: any) => {
    // 事务内读取 + 条件更新（防止 TOCTOU 双人接单）
    const task = await tx.task.findUnique({ where: { id } });
    if (!task) throw new Error("任务不存在");
    if (task.status !== "open") throw new Error("该任务不可接单");
    if (task.publisherId === session.userId) throw new Error("不能接自己发布的任务");

    const effectivePrice = finalPrice > 0 ? finalPrice : task.budget;
    if (!effectivePrice || effectivePrice <= 0) throw new Error("请填写报价");

    // 条件更新：只有 status=open 时才更新
    await tx.task.update({
      where: { id, status: "open" },
      data: { status: "assigned" },
    });

    const order = await tx.order.create({
      data: {
        orderNo,
        schoolId: task.schoolId,
        buyerId: task.publisherId,
        sellerId: session.userId,
        orderType: "task",
        bizType: "market",
        status: ORDER_STATUS.PENDING_PAYMENT,
        totalAmount: effectivePrice,
        note: `任务接单：${task.title}`,
      },
    });

    await tx.orderItem.create({
      data: {
        orderId: order.id,
        taskId: task.id,
        quantity: 1,
        unitPrice: effectivePrice,
        totalPrice: effectivePrice,
      },
    });

    await tx.message.create({
      data: {
        schoolId: task.schoolId,
        senderId: session.userId,
        receiverId: task.publisherId,
        type: "notification",
        title: "任务已被接单",
        content: `您发布的「${task.title}」已被 ${user.nickname} 接单，报价 ¥${effectivePrice}，请前往订单页面支付。`,
      },
    });

    return { order, taskTitle: task.title, effectivePrice };
  }).catch((err: Error) => {
    if (err.message === "任务不存在" || err.message === "该任务不可接单" ||
        err.message === "不能接自己发布的任务" || err.message === "请填写报价") {
      return null;
    }
    throw err;
  });

  if (!result) return apiError("接单失败", 400);

  await auditLog({
    userId: session.userId,
    action: "task_accept",
    targetType: "task",
    targetId: id,
    detail: `接单任务「${result.taskTitle}」，报价 ¥${result.effectivePrice}`,
  });

  return apiSuccess(result.order);
}
