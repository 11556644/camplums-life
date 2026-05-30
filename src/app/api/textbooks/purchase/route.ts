export const dynamic = "force-dynamic";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { auditLog, domainEvent } from "@/lib/logger";
import { apiSuccess, apiError } from "@/lib/api-response";
import { generateOrderNo, ORDER_STATUS } from "@/lib/order-state-machine";
import { calculateBookRentalPrice, getBookOriginalPrice } from "@/lib/pricing";
import { broadcastEvent } from "@/lib/realtime";
import { z } from "zod";

const purchaseSchema = z.object({
  items: z.array(z.object({
    textbookId: z.string(),
    quantity: z.number().int().min(1).default(1),
  })).min(1),
  planId: z.string().optional(),
  rentalDays: z.number().int().min(7).max(730).default(120),
  deliveryType: z.enum(["cabinet", "dormitory"]),
  cabinetSlotId: z.string().optional(),
  dormitory: z.string().optional(),
  roomNumber: z.string().optional(),
  floor: z.string().optional(),
});

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return apiError("请先登录", 401);

  const body = await req.json();
  const parsed = purchaseSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0].message);

  const { items, planId, rentalDays, deliveryType, cabinetSlotId, dormitory, roomNumber, floor } = parsed.data;

  if (deliveryType === "cabinet" && !cabinetSlotId) return apiError("请选择智能柜");
  if (deliveryType === "dormitory" && (!dormitory || !roomNumber)) return apiError("请填写宿舍信息");

  // 套餐信息
  let plan: { id: string; deposit: number; freeLateDays: number; price: number; maxBooks: number } | null = null;
  let deposit = 0;
  let freeLateDays = 3;

  if (planId) {
    const foundPlan = await db.subscriptionPlan.findUnique({ where: { id: planId } });
    if (!foundPlan || foundPlan.status !== "active") return apiError("套餐不存在或已下架");
    plan = foundPlan;
    deposit = foundPlan.deposit;
    freeLateDays = foundPlan.freeLateDays;
  }

  // 获取每本书的原价，按本独立计价
  const textbookIds = items.map(i => i.textbookId);
  const textbookRecords = await db.textbook.findMany({
    where: { id: { in: textbookIds } },
    select: { id: true, title: true, originalPrice: true },
  });
  const priceMap = new Map(textbookRecords.map(t => [t.id, t.originalPrice || getBookOriginalPrice(t.title)]));

  // 计算每本书的单价
  const getItemPrice = (textbookId: string): number => {
    const origPrice = priceMap.get(textbookId) || 50;
    if (planId && plan) {
      // 套餐价：按套餐均摊，但不超过原价
      return Math.min(Math.ceil(plan.price / plan.maxBooks), origPrice);
    }
    // 按本借阅：使用定价算法，硬上限原价
    return calculateBookRentalPrice(origPrice, rentalDays);
  };

  const totalAmount = items.reduce((sum, item) => sum + getItemPrice(item.textbookId) * item.quantity, 0) + deposit;
  const totalBooks = items.reduce((s, i) => s + i.quantity, 0);

  const user = await db.user.findUnique({ where: { id: session.userId } });
  if (!user) return apiError("用户不存在");

  const orderNo = generateOrderNo();
  const dueDate = new Date(Date.now() + rentalDays * 24 * 60 * 60 * 1000);

  const result = await db.$transaction(async (tx: any) => {
    const order = await tx.order.create({
      data: {
        orderNo,
        schoolId: user.schoolId,
        buyerId: session.userId,
        sellerId: session.userId,
        orderType: "subscription",
        bizType: "textbook",
        status: ORDER_STATUS.PENDING_PAYMENT,
        totalAmount,
        deposit,
        note: `rentalDays=${rentalDays}|freeLateDays=${freeLateDays}|${deliveryType === "cabinet" ? `智能柜自取，柜格ID: ${cabinetSlotId}` : `宿舍配送：${dormitory} ${floor || ""}层 ${roomNumber}室`}`,
      },
    });

    let subscriptionOrder = null;
    if (plan) {
      subscriptionOrder = await tx.subscriptionOrder.create({
        data: {
          userId: session.userId,
          planId: plan.id,
          orderId: order.id,
          status: "pending",
          startDate: new Date(),
          endDate: dueDate,
        },
      });
    }

    for (const item of items) {
      const textbook = await tx.textbook.findUnique({ where: { id: item.textbookId } });
      if (!textbook) throw new Error(`书籍 ${item.textbookId} 不存在`);

      const copies = await tx.textbookCopy.findMany({
        where: { textbookId: item.textbookId, status: "available" },
        orderBy: { condition: "asc" },
        take: item.quantity,
      });

      if (copies.length < item.quantity) throw new Error(`《${textbook.title}》库存不足`);

      for (const copy of copies) {
        await tx.textbookCopy.update({
          where: { id: copy.id },
          data: {
            status: "reserved",
            borrowerId: session.userId,
          },
        });

        await tx.inventoryTransaction.create({
          data: {
            copyId: copy.id,
            fromStatus: "available",
            toStatus: "reserved",
            operatorId: session.userId,
            detail: `预留，待支付确认，租期${rentalDays}天`,
          },
        });
      }

      const bookPrice = getItemPrice(item.textbookId);
      await tx.orderItem.create({
        data: {
          orderId: order.id,
          textbookId: item.textbookId,
          quantity: item.quantity,
          unitPrice: bookPrice,
          totalPrice: bookPrice * item.quantity,
        },
      });
    }

    // 智能柜预留：下单时立即锁定柜格
    let cabinetBinding = null;
    if (deliveryType === "cabinet" && cabinetSlotId) {
      const slot = await tx.cabinetSlot.findUnique({
        where: { id: cabinetSlotId },
        include: { cabinet: true },
      });
      if (!slot) throw new Error("柜格不存在");
      if (slot.status !== "empty") throw new Error("该柜格已被占用");

      await tx.cabinetSlot.update({
        where: { id: cabinetSlotId, status: "empty" },
        data: { status: "reserved" },
      });

      const pickupCode = crypto.randomUUID().replace(/-/g, "").slice(0, 6);
      cabinetBinding = await tx.cabinetSlotOrder.create({
        data: {
          slotId: cabinetSlotId,
          orderId: order.id,
          depositType: "storage",
          pickupCode,
          status: "active",
          depositorId: session.userId,
        },
      });

      await tx.cabinetSlotLog.create({
        data: {
          slotId: cabinetSlotId,
          action: "reserve",
          operatorId: session.userId,
          detail: `订单预留，订单号：${orderNo}`,
        },
      });
    }

    return { order, subscriptionOrder, cabinetBinding };
  });

  await auditLog({
    userId: session.userId,
    action: "textbook_rent",
    targetType: "order",
    targetId: result.order.id,
    detail: `借阅 ${totalBooks} 本书，租期${rentalDays}天，金额 ¥${totalAmount}，应还：${dueDate.toLocaleDateString("zh-CN")}`,
  });

  await domainEvent({
    userId: session.userId,
    eventType: "order.created",
    aggregateType: "order",
    aggregateId: result.order.id,
    payload: { orderNo, totalAmount, totalBooks, rentalDays, dueDate: dueDate.toISOString() },
  });

  broadcastEvent({ type: "textbook", action: "purchased", targetId: result.order.id, userId: session.userId });

  return apiSuccess({ ...result.order, rentalDays, dueDate });
}
