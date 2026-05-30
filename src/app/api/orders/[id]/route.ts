import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { auditLog, domainEvent } from "@/lib/logger";
import { apiSuccess, apiError } from "@/lib/api-response";
import { canTransition, ORDER_STATUS } from "@/lib/order-state-machine";
import { publishEvent } from "@/lib/realtime";
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

    // 任务订单开始执行：同步更新任务状态
    if (action === "start" && order.orderType === "task") {
      const taskItem = await tx.orderItem.findFirst({ where: { orderId: order.id, taskId: { not: null } } });
      if (taskItem?.taskId) {
        await tx.task.update({ where: { id: taskItem.taskId }, data: { status: "in_progress" } });
      }
    }

    // 发货
    if (action === "ship") {
      if (order.deliveryMethod === "cabinet") {
        // 智能柜交收：将柜格升级为已占用，设置费用和过期时间
        const binding = await tx.cabinetSlotOrder.findFirst({
          where: { orderId: order.id, status: "active" },
          include: { slot: { include: { cabinet: true } } },
        });
        if (!binding) {
          console.error(`[cabinet-ship] No active binding for order ${order.id}, deliveryMethod=${order.deliveryMethod}`);
          throw new Error("未找到预留柜格，该订单的柜格绑定可能已丢失，请取消订单后重新下单");
        }

        // 检查柜格当前状态
        const currentSlot = await tx.cabinetSlot.findUnique({ where: { id: binding.slotId } });
        if (!currentSlot) throw new Error("柜格不存在");
        if (currentSlot.status === "fault") throw new Error("柜格故障，无法存入");
        if (currentSlot.status === "occupied") throw new Error("柜格已被占用，请联系管理员");

        // 从 binding 获取预选时长，计算卖家应付费用
        const durationMinutes = (binding.durationHours || 2) * 60;
        const { calculateTradeDeliveryFee } = await import("@/lib/pricing");
        const feeSplit = calculateTradeDeliveryFee(durationMinutes);
        const sellerFee = feeSplit.sellerPays;
        const expiresAt = new Date(Date.now() + durationMinutes * 60 * 1000);

        console.log(`[cabinet-ship] Order ${order.orderNo}: binding=${binding.id}, slot=${binding.slotId}(${currentSlot.status}), duration=${durationMinutes}min, sellerFee=¥${sellerFee}`);

        // 卖家钱包扣费（¥0 时不扣）
        if (sellerFee > 0) {
          let sellerWallet = await tx.wallet.findUnique({ where: { userId: order.sellerId } });
          if (!sellerWallet) {
            sellerWallet = await tx.wallet.create({
              data: { userId: order.sellerId, schoolId: order.schoolId, balance: 0 },
            });
          }
          if (sellerWallet.balance < sellerFee) {
            console.error(`[cabinet-ship] Seller wallet insufficient: need ¥${sellerFee}, have ¥${sellerWallet.balance}, seller=${order.sellerId}`);
            throw new Error(`钱包余额不足，需要 ¥${sellerFee}，当前余额 ¥${sellerWallet.balance}。请先充值后再存入。`);
          }
          const newBal = sellerWallet.balance - sellerFee;
          await tx.wallet.update({ where: { id: sellerWallet.id }, data: { balance: newBal } });
          await tx.walletTransaction.create({
            data: {
              walletId: sellerWallet.id, type: "cabinet_fee", amount: -sellerFee,
              balanceBefore: sellerWallet.balance, balanceAfter: newBal,
              orderId: order.id, method: "wallet", status: "success",
            },
          });
        }

        // reserved/empty → occupied（兼容预留被意外释放的情况）
        await tx.cabinetSlot.update({
          where: { id: binding.slotId },
          data: { status: "occupied" },
        });

        await tx.cabinetSlotOrder.update({
          where: { id: binding.id },
          data: {
            fee: sellerFee,
            prepaidFee: sellerFee + feeSplit.buyerPays,
            durationHours: Math.ceil(durationMinutes / 60),
            expiresAt,
          },
        });

        await tx.cabinetSlotLog.create({
          data: {
            slotId: binding.slotId,
            action: "deposit",
            operatorId: session.userId,
            detail: `卖家存入商品，订单 ${order.orderNo}，时长${durationMinutes}分钟，卖家付¥${sellerFee}，${expiresAt.toLocaleTimeString("zh-CN")}前取件`,
          },
        });

        // 通知买家取件码
        await tx.message.create({
          data: {
            schoolId: order.schoolId,
            senderId: order.sellerId,
            receiverId: order.buyerId,
            type: "notification",
            title: "商品已存入智能柜",
            content: `订单 ${order.orderNo} 已存入 ${binding.slot.cabinet.name} #${binding.slot.slotNumber}，取件码：${binding.pickupCode}，请在 ${expiresAt.toLocaleTimeString("zh-CN")} 前取件。超时将按 ¥0.5/小时 计费。`,
          },
        });
      } else {
        // 面对面/物流交收：创建物流路线
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
    }

    // 统一完成副作用（商品已售、任务完成、卖家结算扣佣、信用分、通知）
    if (action === "complete") {
      await onOrderCompleted({ tx, order, userId: session.userId });
    }

    // 统一取消副作用（退款、柜格释放、任务回退、商品恢复、信用分、通知）
    if (action === "cancel") {
      await onOrderCancelled({ tx, order, userId: session.userId, prevStatus: order.status });
    }

    return { updatedOrder, buyerId: order.buyerId, sellerId: order.sellerId, orderNo: order.orderNo, prevStatus: order.status };
  }).catch((err: Error) => {
    if (err.message === "NOT_FOUND") return null;
    if (err.message.startsWith("ONLY_") || err.message === "NO_PERMISSION") return null;
    if (err.message.startsWith("STATUS_INVALID")) return null;
    // 柜格和余额相关错误，返回具体信息给前端
    if (err.message.includes("柜格") || err.message.includes("预留") || err.message.includes("余额") || err.message.includes("不足")) return { error: err.message };
    throw err;
  });

  if (!result) return apiError("操作失败，请检查订单状态", 400);
  if ("error" in result && result.error) return apiError(result.error as string, 400);

  const ok = result as { updatedOrder: any; buyerId: string; sellerId: string; orderNo: string; prevStatus: string };

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
