export const dynamic = "force-dynamic";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { auditLog, domainEvent } from "@/lib/logger";
import { apiSuccess, apiError } from "@/lib/api-response";
import { generateOrderNo, ORDER_STATUS } from "@/lib/order-state-machine";
import { z } from "zod";

const RENTAL_OPTIONS = [
  { days: 30, label: "1个月", priceMultiplier: 0.35 },
  { days: 90, label: "1学期", priceMultiplier: 0.75 },
  { days: 120, label: "标准学期", priceMultiplier: 1.0 },
  { days: 365, label: "1学年", priceMultiplier: 1.6 },
];

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

  // 根据租期计算价格
  let baseUnitPrice: number;
  let plan: { id: string; deposit: number; freeLateDays: number; price: number; maxBooks: number } | null = null;
  let deposit = 0;
  let freeLateDays = 3;

  if (planId) {
    const foundPlan = await db.subscriptionPlan.findUnique({ where: { id: planId } });
    if (!foundPlan || foundPlan.status !== "active") return apiError("套餐不存在或已下架");
    plan = foundPlan;
    baseUnitPrice = Math.ceil(foundPlan.price / foundPlan.maxBooks);
    deposit = foundPlan.deposit;
    freeLateDays = foundPlan.freeLateDays;
  } else {
    const plans = await db.subscriptionPlan.findMany({ where: { status: "active" }, take: 1 });
    baseUnitPrice = plans.length > 0 ? Math.ceil(plans[0].price / plans[0].maxBooks) : 30;
  }

  // 根据租期动态调整单价：以120天为基准，按比例计算
  const referenceDays = 120;
  const durationMultiplier = rentalDays <= referenceDays
    ? 0.2 + (rentalDays / referenceDays) * 0.8  // 短租：20%基础 + 按比例
    : 1.0 + ((rentalDays - referenceDays) / referenceDays) * 0.6; // 长租：递增但有折扣
  const unitPrice = Math.max(1, Math.round(baseUnitPrice * durationMultiplier));

  const totalBooks = items.reduce((s, i) => s + i.quantity, 0);
  const totalAmount = unitPrice * totalBooks + deposit;

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
        note: `${deliveryType === "cabinet" ? `智能柜自取，柜格ID: ${cabinetSlotId}` : `宿舍配送：${dormitory} ${floor || ""}层 ${roomNumber}室`}，租期${rentalDays}天，免费宽限${freeLateDays}天`,
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
            status: "borrowed",
            borrowerId: session.userId,
            borrowedAt: new Date(),
            dueDate,
          },
        });

        await tx.inventoryTransaction.create({
          data: {
            copyId: copy.id,
            fromStatus: "available",
            toStatus: "borrowed",
            operatorId: session.userId,
            detail: `借出，租期${rentalDays}天，应还：${dueDate.toLocaleDateString("zh-CN")}`,
          },
        });
      }

      await tx.orderItem.create({
        data: {
          orderId: order.id,
          textbookId: item.textbookId,
          quantity: item.quantity,
          unitPrice,
          totalPrice: unitPrice * item.quantity,
        },
      });
    }

    return { order, subscriptionOrder };
  });

  await auditLog({
    userId: session.userId,
    action: "textbook_rent",
    targetType: "order",
    targetId: result.order.id,
    detail: `借阅 ${totalBooks} 本书，租期${rentalDays}天，金额 ¥${totalAmount}，应还：${dueDate.toLocaleDateString("zh-CN")}`,
  });

  await domainEvent({
    eventType: "order.created",
    aggregateType: "order",
    aggregateId: result.order.id,
    payload: { orderNo, totalAmount, totalBooks, rentalDays, dueDate: dueDate.toISOString() },
  });

  return apiSuccess({ ...result.order, unitPrice, rentalDays, dueDate });
}
