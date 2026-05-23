import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { auditLog, domainEvent } from "@/lib/logger";
import { apiSuccess, apiError } from "@/lib/api-response";
import { generateOrderNo, ORDER_STATUS } from "@/lib/order-state-machine";

// 接受任务（创建订单）
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return apiError("请先登录", 401);

  const { id } = await params;
  const body = await req.json();
  const { price } = body; // 报价（可选，面议型任务用）

  const task = await db.task.findUnique({ where: { id } });
  if (!task) return apiError("任务不存在", 404);
  if (task.status !== "open") return apiError("该任务不可接单");
  if (task.publisherId === session.userId) return apiError("不能接自己发布的任务");

  const finalPrice = price ?? task.budget;
  if (!finalPrice || finalPrice <= 0) return apiError("请填写报价");

  const user = await db.user.findUnique({ where: { id: session.userId } });
  if (!user) return apiError("用户不存在");

  const orderNo = generateOrderNo();

  const result = await db.$transaction(async (tx: any) => {
    // 更新任务状态
    await tx.task.update({
      where: { id },
      data: { status: "assigned" },
    });

    // 创建订单
    const order = await tx.order.create({
      data: {
        orderNo,
        schoolId: task.schoolId,
        buyerId: task.publisherId, // 任务发布者是付款方
        sellerId: session.userId, // 接单者是服务方
        orderType: "task",
        bizType: "market",
        status: ORDER_STATUS.PENDING_PAYMENT,
        totalAmount: finalPrice,
        note: `任务接单：${task.title}`,
      },
    });

    await tx.orderItem.create({
      data: {
        orderId: order.id,
        taskId: task.id,
        quantity: 1,
        unitPrice: finalPrice,
        totalPrice: finalPrice,
      },
    });

    // 通知发布者
    await tx.message.create({
      data: {
        schoolId: task.schoolId,
        senderId: session.userId,
        receiverId: task.publisherId,
        type: "notification",
        title: "任务已被接单",
        content: `您发布的「${task.title}」已被 ${user.nickname} 接单，报价 ¥${finalPrice}，请前往订单页面支付。`,
      },
    });

    return order;
  });

  await auditLog({
    userId: session.userId,
    action: "task_accept",
    targetType: "task",
    targetId: id,
    detail: `接单任务「${task.title}」，报价 ¥${finalPrice}`,
  });

  return apiSuccess(result);
}
