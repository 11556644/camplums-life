import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { auditLog, domainEvent } from "@/lib/logger";
import { apiSuccess, apiError } from "@/lib/api-response";
import { ORDER_STATUS } from "@/lib/order-state-machine";

// 取件
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return apiError("请先登录", 401);

  const body = await req.json();
  const { pickupCode, reject } = body; // reject=true 表示拒收

  if (!pickupCode) return apiError("请输入取件码");

  const binding = await db.cabinetSlotOrder.findUnique({
    where: { pickupCode },
    include: {
      slot: { include: { cabinet: true } },
      order: true,
    },
  });

  if (!binding) return apiError("取件码无效");
  if (binding.status !== "active") return apiError("该取件码已使用或已过期");

  const result = await db.$transaction(async (tx: any) => {
    // 更新柜格状态
    await tx.cabinetSlot.update({
      where: { id: binding.slotId },
      data: { status: "empty" },
    });

    // 更新绑定记录
    await tx.cabinetSlotOrder.update({
      where: { id: binding.id },
      data: {
        status: reject ? "cancelled" : "retrieved",
        retrieverId: session.userId,
        retrievedAt: new Date(),
      },
    });

    // 记录操作日志
    await tx.cabinetSlotLog.create({
      data: {
        slotId: binding.slotId,
        action: "retrieve",
        operatorId: session.userId,
        detail: reject ? "买家拒收" : "取件成功",
      },
    });

    // 联动更新订单状态
    if (binding.orderId && binding.order) {
      if (reject) {
        // 拒收：更新订单为纠纷状态，通知卖家
        await tx.order.update({
          where: { id: binding.orderId },
          data: { status: ORDER_STATUS.DISPUTED },
        });
        await tx.message.create({
          data: {
            schoolId: binding.order.schoolId,
            receiverId: binding.order.sellerId,
            type: "notification",
            title: "买家拒收",
            content: `订单 ${binding.order.orderNo} 的买家已拒收商品，请处理。`,
          },
        });
      } else {
        // 正常取件：更新订单为已送达（等待买家确认收货）
        if (binding.order.status === ORDER_STATUS.SHIPPED || binding.order.status === ORDER_STATUS.PAID) {
          await tx.order.update({
            where: { id: binding.orderId },
            data: { status: ORDER_STATUS.DELIVERED },
          });
          await tx.message.create({
            data: {
              schoolId: binding.order.schoolId,
              receiverId: binding.order.buyerId,
              type: "notification",
              title: "已取件，请确认收货",
              content: `您已从智能柜取出订单 ${binding.order.orderNo} 的商品，请确认收货。`,
            },
          });
        }
      }
    }

    return binding;
  });

  await auditLog({
    userId: session.userId,
    action: reject ? "cabinet_reject" : "cabinet_retrieve",
    targetType: "cabinet",
    targetId: binding.slotId,
    detail: `从 ${result.slot.cabinet.name} #${result.slot.slotNumber} ${reject ? "拒收" : "取件"}`,
  });

  await domainEvent({
    eventType: reject ? "cabinet.rejected" : "cabinet.retrieved",
    aggregateType: "cabinet",
    aggregateId: binding.slotId,
    payload: { pickupCode, reject: !!reject },
  });

  return apiSuccess({ message: reject ? "已拒收" : "取件成功" });
}
