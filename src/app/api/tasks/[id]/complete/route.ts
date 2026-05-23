import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { auditLog } from "@/lib/logger";
import { apiSuccess, apiError } from "@/lib/api-response";
import { canTransition, ORDER_STATUS } from "@/lib/order-state-machine";

// 确认任务完成
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return apiError("请先登录", 401);

  const { id } = await params;
  const body = await req.json();
  const { orderId } = body;

  if (!orderId) return apiError("缺少订单ID");

  const order = await db.order.findUnique({ where: { id: orderId } });
  if (!order) return apiError("订单不存在", 404);
  if (order.buyerId !== session.userId) return apiError("只有任务发布者可以确认完成");
  if (!canTransition(order.orderType, order.status, ORDER_STATUS.COMPLETED)) {
    return apiError(`订单状态不允许完成（当前：${order.status}）`);
  }

  const task = await db.task.findUnique({ where: { id } });
  if (!task) return apiError("任务不存在", 404);

  await db.$transaction(async (tx: any) => {
    // 更新订单为已完成
    await tx.order.update({
      where: { id: orderId },
      data: { status: ORDER_STATUS.COMPLETED, completedAt: new Date() },
    });

    // 更新任务为已完成
    await tx.task.update({
      where: { id },
      data: { status: "completed" },
    });

    // 通知服务者 + 结算到钱包
    const sellerWallet = await tx.wallet.findUnique({ where: { userId: order.sellerId } });
    if (sellerWallet) {
      await tx.wallet.update({
        where: { userId: order.sellerId },
        data: { balance: sellerWallet.balance + order.totalAmount },
      });
      await tx.walletTransaction.create({
        data: {
          walletId: sellerWallet.id, type: "topup", amount: order.totalAmount,
          balanceBefore: sellerWallet.balance, balanceAfter: sellerWallet.balance + order.totalAmount,
          orderId, method: "settlement", status: "success",
        },
      });
    }

    await tx.message.create({
      data: {
        schoolId: task.schoolId,
        receiverId: order.sellerId,
        type: "notification",
        title: "任务已完成",
        content: `任务「${task.title}」已被发布者确认完成，¥${order.totalAmount} 已结算到您的钱包。`,
      },
    });
  });

  await auditLog({
    userId: session.userId,
    action: "task_complete",
    targetType: "task",
    targetId: id,
    detail: `确认任务「${task.title}」完成`,
  });

  return apiSuccess({ message: "任务已完成" });
}
