import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/api-helpers";
import { auditLog } from "@/lib/logger";
import { apiSuccess, apiError } from "@/lib/api-response";
import { canTransition } from "@/lib/order-state-machine";
import { onOrderCompleted, onOrderCancelled } from "@/lib/settlement";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin(req);

  const { id } = await params;
  const body = await req.json();
  const { action } = body;

  const statusMap: Record<string, string> = {
    cancel: "cancelled",
    complete: "completed",
  };
  const newStatus = statusMap[action];
  if (!newStatus) return apiError("无效操作");

  const result = await db.$transaction(async (tx: any) => {
    const order = await tx.order.findUnique({ where: { id }, include: { items: true } });
    if (!order) throw new Error("NOT_FOUND");

    if (!canTransition(order.orderType, order.status, newStatus)) {
      throw new Error("STATUS_INVALID");
    }

    const prevStatus = order.status;
    const updated = await tx.order.update({
      where: { id },
      data: {
        status: newStatus,
        ...(newStatus === "completed" ? { completedAt: new Date() } : {}),
        ...(newStatus === "cancelled" ? { cancelledAt: new Date() } : {}),
      },
    });

    if (action === "complete") {
      await onOrderCompleted({ tx, order: { ...order, status: prevStatus }, userId: session.userId });
    }
    if (action === "cancel") {
      await onOrderCancelled({ tx, order: { ...order, status: prevStatus }, userId: session.userId, prevStatus });
    }

    return { updated, prevStatus, orderNo: order.orderNo };
  }).catch((err: Error) => {
    if (err.message === "NOT_FOUND") return null;
    if (err.message === "STATUS_INVALID") return "INVALID";
    throw err;
  });

  if (result === null) return apiError("订单不存在", 404);
  if (result === "INVALID") return apiError("当前状态不允许此操作");

  await auditLog({
    userId: session.userId,
    action: `admin_order_${action}`,
    targetType: "order",
    targetId: id,
    detail: `管理员操作：${result.prevStatus} -> ${newStatus}`,
  });

  return apiSuccess(result.updated);
}
