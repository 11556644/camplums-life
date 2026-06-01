import { db } from "@/lib/db";
import { withAuth } from "@/lib/api-helpers";
import { auditLog, domainEvent } from "@/lib/logger";
import { apiSuccess, apiError } from "@/lib/api-response";
import { broadcastEvent } from "@/lib/realtime";
import { cabinetDepositSchema } from "@/lib/schemas";

export const dynamic = "force-dynamic";

// 获取所有柜机
export const GET = withAuth(async (req, session) => {
  const cabinets = await db.cabinet.findMany({
    where: { schoolId: session.schoolId },
    include: {
      slots: { orderBy: { slotNumber: "asc" } },
    },
    orderBy: { name: "asc" },
  });
  return apiSuccess(cabinets);
});

// 存入物品到柜格（交易寄存 或 付费寄存）
export const POST = withAuth(async (req, session) => {
  const body = await req.json();
  const parsed = cabinetDepositSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0].message);

  const { slotId, orderId, depositType, photo, durationMinutes } = parsed.data;

  // 计算存储费用
  const { calculateCabinetFee, CABINET_PRICING } = await import("@/lib/pricing");
  const isMarketplace = depositType === "trade" && !!orderId;
  const selectedMinutes = durationMinutes || 1440; // 默认1天
  const prepaidFee = calculateCabinetFee(selectedMinutes, selectedMinutes, isMarketplace);
  const expiresAt = new Date(Date.now() + selectedMinutes * 60 * 1000);

  const pickupCode = crypto.randomUUID().replace(/-/g, "").slice(0, 6);

  const result = await db.$transaction(async (tx: any) => {
    // 事务内读取 + 条件更新（防止 TOCTOU）
    const slot = await tx.cabinetSlot.findUnique({
      where: { id: slotId },
      include: { cabinet: true },
    });
    if (!slot) throw new Error("柜格不存在");
    if (slot.status !== "empty") throw new Error("该柜格不可用");

    const updated = await tx.cabinetSlot.update({
      where: { id: slotId, status: "empty" },
      data: { status: "occupied" },
    });
    if (!updated) throw new Error("柜格已被占用");

    // 创建柜格-订单绑定
    const binding = await tx.cabinetSlotOrder.create({
      data: {
        slotId,
        orderId: orderId || null,
        depositType,
        pickupCode,
        status: "active",
        depositorId: session.userId,
        fee: prepaidFee,
        prepaidFee,
        durationHours: Math.ceil(selectedMinutes / 60),
        photo: photo || null,
        expiresAt,
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

    return { binding, cabinetName: slot.cabinet.name, slotNumber: slot.slotNumber };
  });

  await auditLog({
    userId: session.userId,
    action: "cabinet_deposit",
    targetType: "cabinet",
    targetId: slotId,
    detail: `存入柜格 ${result.cabinetName} #${result.slotNumber}`,
  });

  await domainEvent({
    userId: session.userId,
    eventType: "cabinet.deposited",
    aggregateType: "cabinet",
    aggregateId: slotId,
    payload: { pickupCode, depositType },
  });

  broadcastEvent({ type: "cabinet", action: "deposited", targetId: slotId, userId: session.userId });

  return apiSuccess({ ...result, pickupCode });
});
