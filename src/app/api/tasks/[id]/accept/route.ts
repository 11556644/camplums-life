import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { auditLog } from "@/lib/logger";
import { apiSuccess, apiError } from "@/lib/api-response";
import { getCreditPermissions, getExecutionDeadline } from "@/lib/credit";
import { generateOrderNo, ORDER_STATUS } from "@/lib/order-state-machine";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return apiError("请先登录", 401);

  const { id } = await params;

  const user = await db.user.findUnique({ where: { id: session.userId } });
  if (!user) return apiError("用户不存在");

  const perms = await getCreditPermissions(session.userId);
  if (!perms.canBuy) return apiError("信用分不足，无法接单");

  const result = await db.$transaction(async (tx: any) => {
    const task = await tx.task.findUnique({
      where: { id },
      include: { orderItems: { take: 1, include: { order: true } } },
    });
    if (!task) throw new Error("任务不存在");
    if (task.status !== "open") throw new Error("该任务不可接单");
    if (task.publisherId === session.userId) throw new Error("不能接自己发布的任务");

    let order = task.orderItems[0]?.order;

    // 兼容旧任务：没有关联订单时自动创建（后付模式）
    if (!order) {
      const effectivePrice = task.budget;
      if (!effectivePrice || effectivePrice <= 0) throw new Error("任务金额无效，请联系发布者");
      const orderNo = generateOrderNo();
      order = await tx.order.create({
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
        data: { orderId: order.id, taskId: task.id, quantity: 1, unitPrice: effectivePrice, totalPrice: effectivePrice },
      });
    } else {
      // 预付模式：更新 sellerId 为真正的接单者
      await tx.order.update({
        where: { id: order.id },
        data: { sellerId: session.userId },
      });
    }

    const acceptedAt = new Date();

    await tx.task.update({
      where: { id, status: "open" },
      data: {
        status: "assigned",
        assigneeId: session.userId,
        acceptedAt,
        executionDeadline: getExecutionDeadline(task.type, acceptedAt),
      },
    });

    await tx.message.create({
      data: {
        schoolId: task.schoolId,
        senderId: session.userId,
        receiverId: task.publisherId,
        type: "notification",
        title: "任务已被接单",
        content: `您发布的「${task.title}」已被 ${user.nickname} 接单，金额 ¥${order.totalAmount}。`,
      },
    });

    return { orderId: order.id, taskTitle: task.title };
  }).catch((err: Error) => {
    if (["任务不存在", "该任务不可接单", "不能接自己发布的任务", "任务金额无效，请联系发布者"].includes(err.message)) {
      return { error: err.message };
    }
    return { error: `系统错误：${err.message}` };
  });

  if (!result || "error" in result) return apiError(result?.error || "接单失败", 400);

  const successResult = result as { orderId: string; taskTitle: string };
  await auditLog({
    userId: session.userId,
    action: "task_accept",
    targetType: "task",
    targetId: id,
    detail: `接单任务「${successResult.taskTitle}」`,
  });

  return apiSuccess({ message: "接单成功", orderId: successResult.orderId });
}
