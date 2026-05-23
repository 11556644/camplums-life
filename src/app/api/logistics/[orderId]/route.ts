export const dynamic = "force-dynamic";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { apiSuccess, apiError } from "@/lib/api-response";

export async function GET(req: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const session = await getSession();
  if (!session) return apiError("请先登录", 401);

  const { orderId } = await params;

  try {
    const order = await db.order.findUnique({ where: { id: orderId }, select: { buyerId: true, sellerId: true } });
    if (!order) return apiError("订单不存在", 404);

    // 只有买卖双方或管理员可查看物流
    const isAdmin = await db.userRole.findFirst({ where: { userId: session.userId, role: "admin" } });
    if (order.buyerId !== session.userId && order.sellerId !== session.userId && !isAdmin) {
      return apiError("无权查看此订单物流", 403);
    }

    const route = await db.logisticsRoute.findFirst({
      where: { orderId },
      include: { nodes: { orderBy: { sequence: "asc" } } },
    });
    if (!route) return apiError("物流信息不存在", 404);
    return apiSuccess(route);
  } catch {
    return apiError("获取物流信息失败", 500);
  }
}
