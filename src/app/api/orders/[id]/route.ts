import { db } from "@/lib/db";
import { requireAuth } from "@/lib/api-helpers";
import { auditLog, domainEvent } from "@/lib/logger";
import { apiSuccess, apiError } from "@/lib/api-response";
import { maskPhone } from "@/lib/privacy";
import { publishEvent } from "@/lib/realtime";
import { runOrderTransaction } from "./actions";

// 获取订单详情
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAuth(req);
  const { id } = await params;

  const order = await db.order.findUnique({
    where: { id },
    include: {
      items: {
        include: {
          product: true,
          task: true,
        },
      },
      payments: true,
      ratings: true,
      disputes: true,
      buyer: { select: { id: true, nickname: true, phone: true } },
      seller: { select: { id: true, nickname: true, phone: true } },
      cabinetBindings: {
        include: { slot: { include: { cabinet: true } } },
      },
    },
  });

  if (!order) return apiError("订单不存在", 404);

  // 权限检查
  if (order.buyerId !== session.userId && order.sellerId !== session.userId) {
    const user = await db.user.findUnique({ where: { id: session.userId } });
    const isAdmin = user && (await db.userRole.findFirst({ where: { userId: session.userId, role: "admin" } }));
    if (!isAdmin) return apiError("无权查看此订单", 403);
  }

  // 隐私脱敏：非管理员只能看到脱敏手机号
  const isAdmin = await db.userRole.findFirst({ where: { userId: session.userId, role: "admin" } });
  const isCompleted = order.status === "completed";
  const maskedOrder = {
    ...order,
    buyer: order.buyer ? { ...order.buyer, phone: isAdmin ? order.buyer.phone : maskPhone(order.buyer.phone) } : order.buyer,
    seller: order.seller ? { ...order.seller, phone: isAdmin ? order.seller.phone : maskPhone(order.seller.phone) } : order.seller,
  };

  return apiSuccess(maskedOrder);
}

// 更新订单状态（支付、发货、完成等）
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAuth(req);
  const { id } = await params;
  const body = await req.json();
  const { action, method } = body;

  // 执行订单操作（事务 + 状态机 + 侧副作用）
  const result = await runOrderTransaction(db, id, session.userId, action, method);

  if (!result) return apiError("操作失败，请检查订单状态", 400);
  if ("error" in result && result.error) return apiError(result.error as string, 400);

  const ok = result as { updatedOrder: any; buyerId: string; sellerId: string; orderNo: string; prevStatus: string };
  const nextStatus = ok.updatedOrder.status;

  // 实时推送给买卖双方
  publishEvent({
    type: "order",
    action: "status_changed",
    targetId: id,
    userId: session.userId,
    data: { from: ok.prevStatus, to: nextStatus, orderNo: ok.orderNo, action },
  }, [ok.buyerId, ok.sellerId]);

  await auditLog({
    userId: session.userId,
    action: `order_${action}`,
    targetType: "order",
    targetId: id,
    detail: `Order ${ok.orderNo} status: ${ok.prevStatus} -> ${nextStatus}`,
  });

  if (action === "complete") {
    for (const uid of [ok.buyerId, ok.sellerId]) {
      await auditLog({ userId: uid, action: "credit_change", targetType: "credit_score", targetId: uid, detail: `订单完成 +2 信用分` });
    }
  }
  if (action === "cancel") {
    await auditLog({ userId: session.userId, action: "credit_change", targetType: "credit_score", targetId: session.userId, detail: `订单取消 -1 信用分` });
  }

  await domainEvent({
    userId: session.userId,
    eventType: `order.${action}`,
    aggregateType: "order",
    aggregateId: id,
    payload: { from: ok.prevStatus, to: nextStatus },
  });

  return apiSuccess(ok.updatedOrder);
}
