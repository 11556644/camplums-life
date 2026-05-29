import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { auditLog } from "@/lib/logger";
import { apiSuccess, apiError } from "@/lib/api-response";
import { canTransition, ORDER_STATUS } from "@/lib/order-state-machine";
import { onOrderCompleted } from "@/lib/settlement";

// 确认任务完成（发布者确认）
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return apiError("请先登录", 401);

  const { id } = await params;
  const body = await req.json();
  const { orderId } = body;

  if (!orderId) return apiError("缺少订单ID");

  const order = await db.order.findUnique({ where: { id: orderId } });
  if (!order) return apiError("订单不存在", 404);
  if (order.buyerId !== session.userId) return apiError("只有任务发布者可以确认完成");
  if (!canTransition(order.orderType, order.status, ORDER_STATUS.COMPLETED)) {
    return apiError(`订单状态不允许完成（当前：${order.status}）`);
  }

  const task = await db.task.findUnique({ where: { id } });
  if (!task) return apiError("任务不存在", 404);

  // 加上 taskId 供 settlement 使用
  const orderWithTask = { ...order, taskId: id };

  await db.$transaction(async (tx: any) => {
    await tx.order.update({
      where: { id: orderId },
      data: { status: ORDER_STATUS.COMPLETED, completedAt: new Date() },
    });

    // 统一结算：佣金扣除、信用分、通知双方
    await onOrderCompleted({ tx, order: orderWithTask, userId: session.userId });
  });

  await auditLog({
    userId: session.userId,
    action: "task_complete",
    targetType: "task",
    targetId: id,
    detail: `确认任务「${task.title}」完成`,
  });

  return apiSuccess({ message: "任务已完成" });
}
