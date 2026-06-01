export const dynamic = "force-dynamic";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/api-helpers";
import { apiSuccess, apiError } from "@/lib/api-response";

export async function GET(req: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const session = await requireAuth(req);

  const { orderId } = await params;

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
  return apiSuccess({ ...route, buyerId: order.buyerId, sellerId: order.sellerId });
}

// 卖家/管理员推进物流节点
export async function PATCH(req: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const session = await requireAuth(req);

  const { orderId } = await params;
  const body = await req.json();
  const { action } = body; // "advance" | "deliver"

  if (!action || !["advance", "deliver"].includes(action)) {
    return apiError("无效操作");
  }

  const order = await db.order.findUnique({ where: { id: orderId }, select: { id: true, buyerId: true, sellerId: true, status: true, orderNo: true, schoolId: true } });
  if (!order) return apiError("订单不存在", 404);

  const isAdmin = await db.userRole.findFirst({ where: { userId: session.userId, role: "admin" } });
  if (order.sellerId !== session.userId && !isAdmin) {
    return apiError("仅卖家或管理员可更新物流", 403);
  }

  const route = await db.logisticsRoute.findFirst({
    where: { orderId },
    include: { nodes: { orderBy: { sequence: "asc" } } },
  });
  if (!route) return apiError("物流信息不存在", 404);
  if (route.status !== "in_transit") return apiError("物流已完结");

  const currentNode = route.nodes[route.currentNode];

  if (action === "deliver") {
    // 标记送达：最后节点变为 arrived，路线变为 delivered
    await db.$transaction(async (tx: any) => {
      await tx.logisticsNode.update({
        where: { id: currentNode.id },
        data: { status: "arrived", arrivedAt: new Date() },
      });
      await tx.logisticsRoute.update({
        where: { id: route.id },
        data: { status: "delivered" },
      });
    });

    // 通知买家已送达
    await db.message.create({
      data: {
        schoolId: order.schoolId,
        receiverId: order.buyerId,
        type: "notification",
        title: "商品已送达",
        content: `订单 ${order.orderNo} 物流已送达 ${currentNode.nodeName}，请及时确认收货。`,
      },
    });

    return apiSuccess({ message: "已标记送达" });
  }

  // advance：当前节点标记离开，下一节点标记到达
  const nextIndex = route.currentNode + 1;
  if (nextIndex >= route.nodes.length) {
    return apiError("已是最后一站，请使用确认送达");
  }
  const nextNode = route.nodes[nextIndex];

  await db.$transaction(async (tx: any) => {
    await tx.logisticsNode.update({
      where: { id: currentNode.id },
      data: { status: "departed", departedAt: new Date() },
    });
    await tx.logisticsNode.update({
      where: { id: nextNode.id },
      data: { status: "arrived", arrivedAt: new Date() },
    });
    await tx.logisticsRoute.update({
      where: { id: route.id },
      data: { currentNode: nextIndex },
    });
  });

  return apiSuccess({ message: `已到达 ${nextNode.nodeName}` });
}
