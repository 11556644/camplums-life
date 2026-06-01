import { ORDER_STATUS, canTransition } from "@/lib/order-state-machine";
import { onPaymentSettled, onOrderCompleted, onOrderCancelled } from "@/lib/settlement";

// ── Types ────────────────────────────────────────────────────────────

interface ActionResult {
  updatedOrder: any;
  buyerId: string;
  sellerId: string;
  orderNo: string;
  prevStatus: string;
}

// ── Action: pay ──────────────────────────────────────────────────────

async function executePayAction(
  tx: any,
  order: any,
  method: string | undefined,
  userId: string
) {
  await tx.payment.create({
    data: {
      orderId: order.id,
      amount: order.totalAmount,
      method: method || (process.env.NODE_ENV === "production" ? "pending" : "mock"),
      status: "success",
      transactionId: `PAY_${crypto.randomUUID()}`,
      paidAt: new Date(),
    },
  });
  await onPaymentSettled({ tx, order, userId });
}

// ── Action: start (task orders) ──────────────────────────────────────

async function executeStartAction(tx: any, order: any) {
  if (order.orderType !== "task") return;
  const taskItem = await tx.orderItem.findFirst({
    where: { orderId: order.id, taskId: { not: null } },
  });
  if (taskItem?.taskId) {
    await tx.task.update({
      where: { id: taskItem.taskId },
      data: { status: "in_progress" },
    });
  }
}

// ── Action: ship (cabinet vs logistics) ──────────────────────────────

async function executeShipAction(
  tx: any,
  order: any,
  userId: string
) {
  if (order.deliveryMethod === "cabinet") {
    await executeCabinetShip(tx, order);
  } else {
    await executeLogisticsShip(tx, order);
  }
}

async function executeCabinetShip(tx: any, order: any) {
  const binding = await tx.cabinetSlotOrder.findFirst({
    where: { orderId: order.id, status: "active" },
    include: { slot: { include: { cabinet: true } } },
  });
  if (!binding) {
    throw new Error(
      "未找到预留柜格，该订单的柜格绑定可能已丢失，请取消订单后重新下单"
    );
  }

  const currentSlot = await tx.cabinetSlot.findUnique({
    where: { id: binding.slotId },
  });
  if (!currentSlot) throw new Error("柜格不存在");
  if (currentSlot.status === "fault") throw new Error("柜格故障，无法存入");
  if (currentSlot.status === "occupied")
    throw new Error("柜格已被占用，请联系管理员");

  const durationMinutes = (binding.durationHours || 2) * 60;
  const { calculateTradeDeliveryFee } = await import("@/lib/pricing");
  const feeSplit = calculateTradeDeliveryFee(durationMinutes);
  const sellerFee = feeSplit.sellerPays;
  const expiresAt = new Date(Date.now() + durationMinutes * 60 * 1000);

  if (sellerFee > 0) {
    let sellerWallet = await tx.wallet.findUnique({
      where: { userId: order.sellerId },
    });
    if (!sellerWallet) {
      sellerWallet = await tx.wallet.create({
        data: { userId: order.sellerId, schoolId: order.schoolId, balance: 0 },
      });
    }
    if (sellerWallet.balance < sellerFee) {
          throw new Error(
        `钱包余额不足，需要 ¥${sellerFee}，当前余额 ¥${sellerWallet.balance}。请先充值后再存入。`
      );
    }
    const newBal = sellerWallet.balance - sellerFee;
    await tx.wallet.update({
      where: { id: sellerWallet.id },
      data: { balance: newBal },
    });
    await tx.walletTransaction.create({
      data: {
        walletId: sellerWallet.id,
        type: "cabinet_fee",
        amount: -sellerFee,
        balanceBefore: sellerWallet.balance,
        balanceAfter: newBal,
        orderId: order.id,
        method: "wallet",
        status: "success",
      },
    });
  }

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
      operatorId: order.sellerId,
      detail: `卖家存入商品，订单 ${order.orderNo}，时长${durationMinutes}分钟，卖家付¥${sellerFee}，${expiresAt.toLocaleTimeString("zh-CN")}前取件`,
    },
  });

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
}

async function executeLogisticsShip(tx: any, order: any) {
  const route = await tx.logisticsRoute.create({
    data: { orderId: order.id, status: "in_transit", currentNode: 0 },
  });
  await tx.logisticsNode.createMany({
    data: [
      {
        routeId: route.id,
        nodeName: "卖家发货",
        sequence: 0,
        status: "departed",
        departedAt: new Date(),
      },
      {
        routeId: route.id,
        nodeName: "校园快递中心",
        sequence: 1,
        status: "pending",
      },
      {
        routeId: route.id,
        nodeName: "买家收货点",
        sequence: 2,
        status: "pending",
      },
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

// ── Action: complete ─────────────────────────────────────────────────

async function executeCompleteAction(
  tx: any,
  order: any,
  userId: string
) {
  await onOrderCompleted({ tx, order, userId });
}

// ── Action: cancel ───────────────────────────────────────────────────

async function executeCancelAction(
  tx: any,
  order: any,
  userId: string
) {
  await onOrderCancelled({ tx, order, userId, prevStatus: order.status });
}

// ── Status map & permission checks ───────────────────────────────────

const ACTION_TO_STATUS: Record<string, string> = {
  pay: ORDER_STATUS.PAID,
  ship: ORDER_STATUS.SHIPPED,
  deliver: ORDER_STATUS.DELIVERED,
  start: ORDER_STATUS.IN_PROGRESS,
  complete: ORDER_STATUS.COMPLETED,
  cancel: ORDER_STATUS.CANCELLED,
};

function checkPermission(action: string, order: any, userId: string) {
  if (action === "pay" && order.buyerId !== userId)
    throw new Error("ONLY_BUYER_PAY");
  if (action === "ship" && order.sellerId !== userId)
    throw new Error("ONLY_SELLER_SHIP");
  if (action === "deliver" && order.sellerId !== userId)
    throw new Error("ONLY_SELLER_DELIVER");
  if (action === "complete" && order.buyerId !== userId)
    throw new Error("ONLY_BUYER_COMPLETE");
  if (
    action === "cancel" &&
    order.buyerId !== userId &&
    order.sellerId !== userId
  )
    throw new Error("NO_PERMISSION");
}

// ── Main dispatch (runs inside $transaction) ─────────────────────────

export async function executeOrderAction(
  tx: any,
  orderId: string,
  userId: string,
  action: string,
  method?: string
): Promise<ActionResult> {
  const nextStatus = ACTION_TO_STATUS[action];
  if (!nextStatus) throw new Error("INVALID_ACTION");

  const order = await tx.order.findUnique({ where: { id: orderId } });
  if (!order) throw new Error("NOT_FOUND");

  checkPermission(action, order, userId);

  if (!canTransition(order.orderType, order.status, nextStatus)) {
    throw new Error(`STATUS_INVALID:${order.status}->${nextStatus}`);
  }

  const updateData: Record<string, unknown> = { status: nextStatus };
  if (nextStatus === ORDER_STATUS.PAID) updateData.paidAt = new Date();
  if (nextStatus === ORDER_STATUS.COMPLETED) updateData.completedAt = new Date();
  if (nextStatus === ORDER_STATUS.CANCELLED) updateData.cancelledAt = new Date();

  const updatedOrder = await tx.order.update({
    where: { id: orderId, status: order.status },
    data: updateData,
  });

  // Dispatch action-specific side effects
  switch (action) {
    case "pay":
      await executePayAction(tx, order, method, userId);
      break;
    case "start":
      await executeStartAction(tx, order);
      break;
    case "ship":
      await executeShipAction(tx, order, userId);
      break;
    case "complete":
      await executeCompleteAction(tx, order, userId);
      break;
    case "cancel":
      await executeCancelAction(tx, order, userId);
      break;
  }

  return {
    updatedOrder,
    buyerId: order.buyerId,
    sellerId: order.sellerId,
    orderNo: order.orderNo,
    prevStatus: order.status,
  };
}

// ── Transaction wrapper with error handling ──────────────────────────

export async function runOrderTransaction(
  db: any,
  orderId: string,
  userId: string,
  action: string,
  method?: string
): Promise<ActionResult | { error: string }> {
  return db.$transaction(async (tx: any) =>
    executeOrderAction(tx, orderId, userId, action, method)
  ).catch((err: Error) => {
    if (err.message === "NOT_FOUND") return { error: "订单不存在" };
    if (err.message === "ONLY_BUYER_PAY") return { error: "只有买家可以支付" };
    if (err.message === "ONLY_SELLER_SHIP") return { error: "只有卖家可以发货" };
    if (err.message === "ONLY_SELLER_DELIVER") return { error: "只有卖家可以确认送达" };
    if (err.message === "ONLY_BUYER_COMPLETE") return { error: "只有买家可以确认完成" };
    if (err.message === "NO_PERMISSION") return { error: "无权执行此操作" };
    if (err.message.startsWith("STATUS_INVALID")) return { error: "订单状态不允许此操作" };
    if (
      err.message.includes("柜格") ||
      err.message.includes("预留") ||
      err.message.includes("余额") ||
      err.message.includes("不足")
    )
      return { error: err.message };
    throw err;
  });
}
