import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { auditLog, domainEvent } from "@/lib/logger";
import { apiSuccess, apiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

// 获取所有柜机
export async function GET() {
  const session = await getSession();
  if (!session) return apiError("请先登录", 401);

  try {
    const cabinets = await db.cabinet.findMany({
      include: {
        slots: { orderBy: { slotNumber: "asc" } },
      },
      orderBy: { name: "asc" },
    });
    return apiSuccess(cabinets);
  } catch {
    return apiError("获取柜机列表失败", 500);
  }
}

// 存入物品到柜格（交易寄存 或 付费寄存）
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return apiError("请先登录", 401);

  const body = await req.json();
  const { slotId, orderId, depositType, fee, photo } = body;

  if (!slotId || !depositType) return apiError("缺少必要参数");
  if (!["trade", "storage"].includes(depositType)) return apiError("寄存类型无效");

  const slot = await db.cabinetSlot.findUnique({
    where: { id: slotId },
    include: { cabinet: true },
  });
  if (!slot) return apiError("柜格不存在");
  if (slot.status !== "empty") return apiError("该柜格不可用");

  const pickupCode = Math.random().toString().slice(2, 8);

  const result = await db.$transaction(async (tx: any) => {
    // 更新柜格状态
    await tx.cabinetSlot.update({
      where: { id: slotId },
      data: { status: "occupied" },
    });

    // 创建柜格-订单绑定
    const binding = await tx.cabinetSlotOrder.create({
      data: {
        slotId,
        orderId: orderId || null,
        depositType,
        pickupCode,
        status: "active",
        depositorId: session.userId,
        fee: fee || null,
        photo: photo || null,
        expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3天后过期
      },
    });

    // 记录操作日志
    await tx.cabinetSlotLog.create({
      data: {
        slotId,
        action: "deposit",
        operatorId: session.userId,
        detail: `存入物品，取件码：${pickupCode}，类型：${depositType}`,
      },
    });

    // 交易寄存时通知买家
    if (depositType === "trade" && orderId) {
      const order = await tx.order.findUnique({ where: { id: orderId } });
      if (order) {
        await tx.message.create({
          data: {
            schoolId: order.schoolId,
            senderId: session.userId,
            receiverId: order.buyerId,
            type: "notification",
            title: "商品已到达智能柜",
            content: `您的订单 ${order.orderNo} 已存入智能柜，取件码：${pickupCode}，请尽快取件。`,
          },
        });
      }
    }

    return binding;
  });

  await auditLog({
    userId: session.userId,
    action: "cabinet_deposit",
    targetType: "cabinet",
    targetId: slotId,
    detail: `存入柜格 ${slot.cabinet.name} #${slot.slotNumber}`,
  });

  await domainEvent({
    eventType: "cabinet.deposited",
    aggregateType: "cabinet",
    aggregateId: slotId,
    payload: { pickupCode, depositType },
  });

  return apiSuccess({ ...result, pickupCode });
}
