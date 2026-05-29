/**
 * 共享结算逻辑 — 所有支付路径统一调用
 *
 * 解决问题：wallet pay / order PATCH / task complete 三条路径各自实现副作用，
 * 导致不同路径遗漏不同副作用（订阅激活、柜格升级、信用分、通知等）。
 */

import { ORDER_STATUS } from "./order-state-machine";
import { calculateCommission } from "./pricing";

interface SettleContext {
  tx: any; // Prisma transaction client
  order: any; // Order record with items, seller, buyer
  userId: string; // acting user id
}

/**
 * 支付后统一副作用
 * - 订阅订单：激活 subscription
 * - 有柜格绑定：reserved → occupied
 * - 任务订单：自动进入 in_progress + 通知服务者
 * - 通知买家支付成功
 */
export async function onPaymentSettled({ tx, order, userId }: SettleContext) {
  // 订阅激活
  if (order.orderType === "subscription") {
    await tx.subscriptionOrder.updateMany({
      where: { orderId: order.id },
      data: { status: "active" },
    });

    // 教材激活：reserved → borrowed，设置 dueDate
    const rentalDaysMatch = order.note?.match(/rentalDays=(\d+)/);
    const rentalDays = rentalDaysMatch ? parseInt(rentalDaysMatch[1]) : 120;
    const dueDate = new Date(Date.now() + rentalDays * 24 * 60 * 60 * 1000);
    const orderItems = await tx.orderItem.findMany({ where: { orderId: order.id } });
    for (const item of orderItems) {
      if (item.textbookId) {
        const copies = await tx.textbookCopy.findMany({
          where: { textbookId: item.textbookId, borrowerId: order.buyerId, status: "reserved" },
          take: item.quantity,
        });
        for (const copy of copies) {
          await tx.textbookCopy.update({
            where: { id: copy.id },
            data: { status: "borrowed", borrowedAt: new Date(), dueDate },
          });
          await tx.inventoryTransaction.create({
            data: {
              copyId: copy.id, fromStatus: "reserved", toStatus: "borrowed",
              operatorId: userId, detail: `支付确认借出，租期${rentalDays}天，应还：${dueDate.toLocaleDateString("zh-CN")}`,
            },
          });
        }
      }
    }
  }

  // 柜格升级 reserved → occupied
  const bindings = await tx.cabinetSlotOrder.findMany({
    where: { orderId: order.id, status: "active" },
  });
  for (const binding of bindings) {
    await tx.cabinetSlot.update({
      where: { id: binding.slotId, status: "reserved" },
      data: { status: "occupied" },
    });
    await tx.cabinetSlotLog.create({
      data: {
        slotId: binding.slotId,
        action: "pay_confirm",
        operatorId: userId,
        detail: `支付确认，订单 ${order.orderNo}`,
      },
    });
  }

  // 任务订单：跳过 PAID 直接进入 in_progress
  if (order.orderType === "task") {
    await tx.order.update({
      where: { id: order.id },
      data: { status: ORDER_STATUS.IN_PROGRESS },
    });
    await tx.message.create({
      data: {
        schoolId: order.schoolId,
        receiverId: order.sellerId,
        type: "notification",
        title: "任务已支付，请开始执行",
        content: `订单 ${order.orderNo} 已支付，请开始执行任务。`,
      },
    });
  }

  // 通知买家支付成功
  await tx.message.create({
    data: {
      schoolId: order.schoolId,
      receiverId: order.buyerId,
      type: "notification",
      title: "支付成功",
      content: `订单 ${order.orderNo} 已支付成功，金额 ¥${order.totalAmount}。`,
    },
  });
}

/**
 * 完成订单统一副作用
 * - 商品标记已售
 * - 卖家结算（扣除佣金）
 * - 双方信用分 +2
 * - 通知双方
 */
export async function onOrderCompleted({ tx, order, userId }: SettleContext) {
  // 商品标记已售
  if (order.orderType === "product") {
    const items = await tx.orderItem.findMany({ where: { orderId: order.id } });
    for (const item of items) {
      if (item.productId) {
        await tx.product.update({ where: { id: item.productId }, data: { status: "sold" } });
      }
    }
  }

  // 任务完成：更新任务状态
  if (order.orderType === "task") {
    await tx.task.updateMany({
      where: { id: order.taskId || undefined },
      data: { status: "completed" },
    });
  }

  // 卖家结算（扣除佣金）
  const sellerWallet = await tx.wallet.findUnique({ where: { userId: order.sellerId } });
  const comm = calculateCommission(order.totalAmount, order.bizType);
  if (sellerWallet) {
    await tx.wallet.update({
      where: { userId: order.sellerId },
      data: { balance: sellerWallet.balance + comm.sellerReceives },
    });
    await tx.walletTransaction.create({
      data: {
        walletId: sellerWallet.id, type: "settlement", amount: comm.sellerReceives,
        balanceBefore: sellerWallet.balance, balanceAfter: sellerWallet.balance + comm.sellerReceives,
        orderId: order.id, method: "settlement", status: "success",
      },
    });
  }

  // 通知卖家（含佣金说明）
  await tx.message.create({
    data: {
      schoolId: order.schoolId, receiverId: order.sellerId,
      type: "notification", title: "订单已完成",
      content: `订单 ${order.orderNo} 已完成，¥${comm.sellerReceives} 已结算到钱包${comm.fee > 0 ? `（平台服务费 ¥${comm.fee}）` : ""}。`,
    },
  });

  // 通知买家
  await tx.message.create({
    data: {
      schoolId: order.schoolId, receiverId: order.buyerId,
      type: "notification", title: "订单已完成",
      content: `订单 ${order.orderNo} 已确认完成。感谢您的使用！`,
    },
  });

  // 双方信用分 +2
  for (const uid of [order.buyerId, order.sellerId]) {
    const cs = await tx.creditScore.findUnique({ where: { userId: uid } });
    if (cs) await tx.creditScore.update({ where: { userId: uid }, data: { score: cs.score + 2 } });
    await tx.auditLog.create({
      data: {
        userId: uid, schoolId: order.schoolId,
        action: "credit_change", targetType: "credit_score", targetId: uid,
        detail: `订单完成 +2 信用分`,
      },
    });
  }
}

/**
 * 取消订单统一副作用
 * - 释放柜格
 * - 任务回退为 open
 * - 商品恢复上架
 * - 信用分 -1
 * - 已支付退款
 */
export async function onOrderCancelled({ tx, order, userId }: SettleContext) {
  // 取消方信用分 -1
  const cs = await tx.creditScore.findUnique({ where: { userId } });
  if (cs) await tx.creditScore.update({ where: { userId }, data: { score: Math.max(0, cs.score - 1) } });

  // 已支付退款
  if (order.status === ORDER_STATUS.PAID) {
    const wallet = await tx.wallet.findUnique({ where: { userId: order.buyerId } });
    if (wallet) {
      await tx.wallet.update({ where: { userId: order.buyerId }, data: { balance: wallet.balance + order.totalAmount } });
      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id, type: "refund", amount: order.totalAmount,
          balanceBefore: wallet.balance, balanceAfter: wallet.balance + order.totalAmount,
          orderId: order.id, method: "wallet", status: "success",
        },
      });
    }
  }

  // 释放柜格
  const cancelBindings = await tx.cabinetSlotOrder.findMany({
    where: { orderId: order.id, status: "active" },
  });
  for (const binding of cancelBindings) {
    await tx.cabinetSlotOrder.update({ where: { id: binding.id }, data: { status: "cancelled" } });
    await tx.cabinetSlot.update({ where: { id: binding.slotId }, data: { status: "empty" } });
    await tx.cabinetSlotLog.create({
      data: { slotId: binding.slotId, action: "release", operatorId: userId, detail: `订单取消释放，订单 ${order.orderNo}` },
    });
  }

  // 任务回退
  if (order.orderType === "task" && order.taskId) {
    await tx.task.update({ where: { id: order.taskId }, data: { status: "open" } });
  }

  // 商品恢复上架
  if (order.orderType === "product") {
    const items = await tx.orderItem.findMany({ where: { orderId: order.id } });
    for (const item of items) {
      if (item.productId) {
        await tx.product.update({ where: { id: item.productId }, data: { status: "active" } });
      }
    }
  }

  // 教材取消：释放预留/借出的副本
  if (order.orderType === "subscription") {
    const items = await tx.orderItem.findMany({ where: { orderId: order.id } });
    for (const item of items) {
      if (item.textbookId) {
        const copies = await tx.textbookCopy.findMany({
          where: { textbookId: item.textbookId, borrowerId: order.buyerId, status: { in: ["reserved", "borrowed"] } },
        });
        for (const copy of copies) {
          await tx.textbookCopy.update({
            where: { id: copy.id },
            data: { status: "available", borrowerId: null, borrowedAt: null, dueDate: null },
          });
        }
      }
    }
  }

  // 通知对方
  const otherId = userId === order.buyerId ? order.sellerId : order.buyerId;
  await tx.message.create({
    data: {
      schoolId: order.schoolId, receiverId: otherId,
      type: "notification", title: "订单已取消",
      content: `订单 ${order.orderNo} 已被取消。${order.status === ORDER_STATUS.PAID ? "款项已退还到钱包。" : ""}`,
    },
  });
}
