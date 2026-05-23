import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { apiSuccess, apiError } from "@/lib/api-response";

export async function POST() {
  const session = await getSession();
  if (!session) return apiError("请先登录", 401);

  const isAdmin = await db.userRole.findFirst({ where: { userId: session.userId, role: "admin" } });
  if (!isAdmin) return apiError("仅管理员可操作", 403);

  try {
    const routes = await db.logisticsRoute.findMany({
      where: { status: "in_transit" },
      include: { nodes: { orderBy: { sequence: "asc" } } },
    });

    let advanced = 0;
    for (const route of routes) {
      const currentNodeIdx = route.currentNode;
      if (currentNodeIdx >= route.nodes.length - 1) {
        await db.logisticsRoute.update({ where: { id: route.id }, data: { status: "delivered" } });
        const lastNode = route.nodes[route.nodes.length - 1];
        await db.logisticsNode.update({ where: { id: lastNode.id }, data: { status: "arrived", arrivedAt: new Date() } });
        const order = await db.order.findUnique({ where: { id: route.orderId } });
        if (order) {
          await db.message.create({
            data: { schoolId: order.schoolId, type: "notification", receiverId: order.buyerId, title: "商品已送达", content: `订单 ${order.orderNo} 已到达收货点` },
          });
        }
        advanced++;
        continue;
      }
      const currentNode = route.nodes[currentNodeIdx];
      await db.logisticsNode.update({ where: { id: currentNode.id }, data: { status: "departed", departedAt: new Date() } });
      const nextNode = route.nodes[currentNodeIdx + 1];
      await db.logisticsNode.update({ where: { id: nextNode.id }, data: { status: "arrived", arrivedAt: new Date() } });
      await db.logisticsRoute.update({ where: { id: route.id }, data: { currentNode: currentNodeIdx + 1 } });
      advanced++;
    }
    return apiSuccess({ advanced, message: `推进了 ${advanced} 条物流路线` });
  } catch {
    return apiError("模拟物流推进失败", 500);
  }
}
