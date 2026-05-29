import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { auditLog, domainEvent } from "@/lib/logger";
import { apiSuccess, apiError } from "@/lib/api-response";
import { canTransition, ORDER_STATUS } from "@/lib/order-state-machine";
import { maskPhone } from "@/lib/privacy";
import { onPaymentSettled, onOrderCompleted, onOrderCancelled } from "@/lib/settlement";

// 获取订单详情
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return apiError("请先登录", 401);

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
  const session = await getSession();
  if (!session) return apiError("请先登录", 401);

  const { id } = await params;
  const body = await req.json();
  const { action, method } = body;

  // 状态映射
  const actionToStatus: Record<string, string> = {
    pay: ORDER_STATUS.PAID,
    ship: ORDER_STATUS.SHIPPED,
    deliver: ORDER_STATUS.DELIVERED,
    start: ORDER_STATUS.IN_PROGRESS,
    complete: ORDER_STATUS.COMPLETED,
    cancel: ORDER_STATUS.CANCELLED,
  };

  const nextStatus = actionToStatus[action];
  if (!nextStatus) return apiError("无效操作");

  // 在事务内执行：读取 + 状态检查 + 更新（防止 TOCTOU）
  const result = await db.$transaction(async (tx: any) => {
    const order = await tx.order.findUnique({ where: { id } });
    if (!order) throw new Error("NOT_FOUND");

    // 权限检查
    if (action === "pay" && order.buyerId !== session.userId) throw new Error("ONLY_BUYER_PAY");
    if (action === "ship" && order.sellerId !== session.userId) throw new Error("ONLY_SELLER_SHIP");
    if (action === "deliver" && order.sellerId !== session.userId) throw new Error("ONLY_SELLER_DELIVER");
    if (action === "complete" && order.buyerId !== session.userId) throw new Error("ONLY_BUYER_COMPLETE");
    if (action === "cancel" && order.buyerId !== session.userId && order.sellerId !== session.userId) throw new Error("NO_PERMISSION");

    // 状态机检查
    if (!canTransition(order.orderType, order.status, nextStatus)) {
      throw new Error(`STATUS_INVALID:${order.status}->${nextStatus}`);
    }

    // 条件更新：只有状态匹配时才更新（防止并发双击）
    const updateData: Record<string, unknown> = { status: nextStatus };
    if (nextStatus === ORDER_STATUS.PAID) updateData.paidAt = new Date();
    if (nextStatus === ORDER_STATUS.COMPLETED) updateData.completedAt = new Date();
    if (nextStatus === ORDER_STATUS.CANCELLED) updateData.cancelledAt = new Date();

    const updatedOrder = await tx.order.update({
      where: { id, status: order.status },
      data: updateData,
    });

    // 模拟支付：创建支付记录
    if (action === "pay") {
      await tx.payment.create({
        data: {
          orderId: order.id,
          amount: order.totalAmount,
          method: method || "mock",
          status: "success",
          transactionId: `PAY_${crypto.randomUUID()}`,
          paidAt: new Date(),
        },
      });
      // 统一支付后副作用（订阅激活、柜格升级、任务跳转、通知）
      await onPaymentSettled({ tx, order, userId: session.userId });
    }

    // 发货时自动创建物流路线
    if (action === "ship") {
      const route = await tx.logisticsRoute.create({
        data: { orderId: order.id, status: "in_transit", currentNode: 0 },
      });
      await tx.logisticsNode.createMany({
        data: [
          { routeId: route.id, nodeName: "卖家发货", sequence: 0, status: "departed", departedAt: new Date() },
          { routeId: route.id, nodeName: "校园快递中心", sequence: 1, status: "pending" },
          { routeId: route.id, nodeName: "买家收货点", sequence: 2, status: "pending" },
        ],
      });
      await tx.message.create({
        data: {
          schoolId: order.schoolId,
          senderId: order.sellerId,
          receiverId: order.buyerId,
          type: "notification",
          title: "商品已发货",
          content: `您的订单 ${order.orderNo} 已发货，请关注物流信息`,
        },
      });
    }

    // 统一完成副作用（商品已售、任务完成、卖家结算扣佣、信用分、通知）
    if (action === "complete") {
      await onOrderCompleted({ tx, order, userId: session.userId });
    }

    // 统一取消副作用（退款、柜格释放、任务回退、商品恢复、信用分、通知）
    if (action === "cancel") {
      await onOrderCancelled({ tx, order, userId: session.userId });
    }

    return { updatedOrder, buyerId: order.buyerId, sellerId: order.sellerId, orderNo: order.orderNo, prevStatus: order.status };
  }).catch((err: Error) => {
    if (err.message === "NOT_FOUND") return null;
    if (err.message.startsWith("ONLY_") || err.message === "NO_PERMISSION") return null;
    if (err.message.startsWith("STATUS_INVALID")) return null;
    throw err;
  });

  if (!result) return apiError("操作失败", 400);

  await auditLog({
    userId: session.userId,
    action: `order_${action}`,
    targetType: "order",
    targetId: id,
    detail: `Order ${result.orderNo} status: ${result.prevStatus} -> ${nextStatus}`,
  });

  if (action === "complete") {
    for (const uid of [result.buyerId, result.sellerId]) {
      await auditLog({ userId: uid, action: "credit_change", targetType: "credit_score", targetId: uid, detail: `订单完成 +2 信用分` });
    }
  }
  if (action === "cancel") {
    await auditLog({ userId: session.userId, action: "credit_change", targetType: "credit_score", targetId: session.userId, detail: `订单取消 -1 信用分` });
  }

  await domainEvent({
    eventType: `order.${action}`,
    aggregateType: "order",
    aggregateId: id,
    payload: { from: result.prevStatus, to: nextStatus },
  });

  return apiSuccess(result.updatedOrder);
}
