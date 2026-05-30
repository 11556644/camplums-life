/**
 * 共享结算逻辑 — 所有支付路径统一调用
 *
 * 解决问题：wallet pay / order PATCH / task complete 三条路径各自实现副作用，
 * 导致不同路径遗漏不同副作用（订阅激活、柜格升级、信用分、通知等）。
 */

import { ORDER_STATUS } from "./order-state-machine";
import { calculateCommission } from "./pricing";
import { changeCredit } from "./credit";

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
    const borrowedTitles: string[] = [];
    for (const item of orderItems) {
      if (item.textbookId) {
        const copies = await tx.textbookCopy.findMany({
          where: { textbookId: item.textbookId, borrowerId: order.buyerId, status: "reserved" },
          take: item.quantity,
        });
        const textbook = await tx.textbook.findUnique({ where: { id: item.textbookId }, select: { title: true } });
        if (textbook) borrowedTitles.push(`${textbook.title} x${copies.length}`);
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

    // 教材订阅专用通知
    await tx.message.create({
      data: {
        schoolId: order.schoolId,
        receiverId: order.buyerId,
        type: "notification",
        title: "教材借阅已激活",
        content: `您的教材订阅已生效：${borrowedTitles.join("、")}。租期 ${rentalDays} 天，请在 ${dueDate.toLocaleDateString("zh-CN")} 前归还。`,
      },
    });
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

  // 任务订单：预付模式，发布即付款，通知发布者任务已发布
  if (order.orderType === "task") {
    await tx.message.create({
      data: {
        schoolId: order.schoolId,
        receiverId: order.buyerId,
        type: "notification",
        title: "任务已发布并预付",
        content: `您的任务订单 ${order.orderNo} 已预付 ¥${order.totalAmount}，等待接单中。`,
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
  let sellerWallet = await tx.wallet.findUnique({ where: { userId: order.sellerId } });
  if (!sellerWallet) {
    // 接单者从未充值过，自动创建钱包
    sellerWallet = await tx.wallet.create({
      data: { userId: order.sellerId, schoolId: order.schoolId, balance: 0 },
    });
  }
  const comm = calculateCommission(order.totalAmount, order.bizType);
  const newBalance = sellerWallet.balance + comm.sellerReceives;
  await tx.wallet.update({
    where: { id: sellerWallet.id },
    data: { balance: newBalance },
  });
  await tx.walletTransaction.create({
    data: {
      walletId: sellerWallet.id, type: "settlement", amount: comm.sellerReceives,
      balanceBefore: sellerWallet.balance, balanceAfter: newBalance,
      orderId: order.id, method: "settlement", status: "success",
    },
  });

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

  // 双方信用分 +5（订单完成积分）
  for (const uid of [order.buyerId, order.sellerId]) {
    await changeCredit({
      userId: uid, schoolId: order.schoolId,
      delta: 5, reason: `完成订单 ${order.orderNo}`,
      source: "order", orderId: order.id,
    });
  }
}

/**
 * 取消订单统一副作用
 * - 释放柜格
 * - 任务回退为 open
 * - 商品恢复上架
 * - 信用分 -5
 * - 已支付退款
 *
 * @param prevStatus 取消前的订单状态（因调用方已先更新了 status）
 */
export async function onOrderCancelled({ tx, order, userId, prevStatus }: SettleContext & { prevStatus?: string }) {
  // 取消方信用分 -5
  await changeCredit({
    userId, schoolId: order.schoolId,
    delta: -5, reason: `取消订单 ${order.orderNo}`,
    source: "order", orderId: order.id,
  });

  // 已支付退款（用取消前的状态判断，因为 order.status 已被更新为 cancelled）
  if ((prevStatus || order.status) === ORDER_STATUS.PAID) {
    let wallet = await tx.wallet.findUnique({ where: { userId: order.buyerId } });
    if (!wallet) {
      wallet = await tx.wallet.create({
        data: { userId: order.buyerId, schoolId: order.schoolId, balance: 0 },
      });
    }
    const newBalance = wallet.balance + order.totalAmount;
    await tx.wallet.update({ where: { id: wallet.id }, data: { balance: newBalance } });
    await tx.walletTransaction.create({
      data: {
        walletId: wallet.id, type: "refund", amount: order.totalAmount,
        balanceBefore: wallet.balance, balanceAfter: newBalance,
        orderId: order.id, method: "wallet", status: "success",
      },
    });
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

  // 任务回退（从 OrderItem 获取 taskId）
  if (order.orderType === "task") {
    const taskItem = await tx.orderItem.findFirst({ where: { orderId: order.id, taskId: { not: null } } });
    if (taskItem?.taskId) {
      const task = await tx.task.findUnique({ where: { id: taskItem.taskId } });
      // 无人接单→直接取消，有人接单→回退到 open 重新接单
      const newStatus = task?.assigneeId ? "open" : "cancelled";
      await tx.task.update({ where: { id: taskItem.taskId }, data: { status: newStatus } });
    }
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
