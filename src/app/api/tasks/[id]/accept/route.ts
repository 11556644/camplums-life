import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { auditLog } from "@/lib/logger";
import { apiSuccess, apiError } from "@/lib/api-response";
import { getCreditPermissions, getExecutionDeadline } from "@/lib/credit";

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

    const order = task.orderItems[0]?.order;
    if (!order) throw new Error("任务订单不存在");

    const acceptedAt = new Date();

    // 更新任务：指派接单人
    await tx.task.update({
      where: { id, status: "open" },
      data: {
        status: "assigned",
        assigneeId: session.userId,
        acceptedAt,
        executionDeadline: getExecutionDeadline(task.type, acceptedAt),
      },
    });

    // 更新订单：把占位的 sellerId 改为真正的接单者
    await tx.order.update({
      where: { id: order.id },
      data: { sellerId: session.userId },
    });

    // 通知发布者
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
    if (["任务不存在", "该任务不可接单", "不能接自己发布的任务", "任务订单不存在"].includes(err.message)) {
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
    detail: `接单任务「${result.taskTitle}」`,
  });

  return apiSuccess({ message: "接单成功", orderId: result.orderId });
}
