import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { auditLog } from "@/lib/logger";
import { apiSuccess, apiError } from "@/lib/api-response";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return apiError("请先登录", 401);

  const isAdmin = await db.userRole.findFirst({ where: { userId: session.userId, role: "admin" } });
  if (!isAdmin) return apiError("无权限", 403);

  const { id } = await params;
  const body = await req.json();
  const { action } = body; // cancel, complete

  const order = await db.order.findUnique({ where: { id } });
  if (!order) return apiError("订单不存在", 404);

  const statusMap: Record<string, string> = {
    cancel: "cancelled",
    complete: "completed",
  };

  const newStatus = statusMap[action];
  if (!newStatus) return apiError("无效操作");

  const updated = await db.order.update({
    where: { id },
    data: {
      status: newStatus,
      ...(newStatus === "completed" ? { completedAt: new Date() } : {}),
      ...(newStatus === "cancelled" ? { cancelledAt: new Date() } : {}),
    },
  });

  await auditLog({
    userId: session.userId,
    action: `admin_order_${action}`,
    targetType: "order",
    targetId: id,
    detail: `管理员手动操作：${order.status} -> ${newStatus}`,
  });

  return apiSuccess(updated);
}
