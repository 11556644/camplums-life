export const dynamic = "force-dynamic";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { auditLog, domainEvent } from "@/lib/logger";
import { apiSuccess, apiError } from "@/lib/api-response";
import { generateOrderNo, ORDER_STATUS } from "@/lib/order-state-machine";
import { z } from "zod";

const purchaseSchema = z.object({
  items: z.array(z.object({
    textbookId: z.string(),
    quantity: z.number().int().min(1).default(1),
  })).min(1),
  planId: z.string().optional(), // 订阅套餐ID（可选，不传则按本计费）
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

  const { items, planId, deliveryType, cabinetSlotId, dormitory, roomNumber, floor } = parsed.data;

  if (deliveryType === "cabinet" && !cabinetSlotId) return apiError("请选择智能柜");
  if (deliveryType === "dormitory" && (!dormitory || !roomNumber)) return apiError("请填写宿舍信息");

  // 计算价格
  let unitPrice: number;
  let plan: any = null;
  let deposit = 0;

  if (planId) {
    const foundPlan = await db.subscriptionPlan.findUnique({ where: { id: planId } });
    if (!foundPlan || foundPlan.status !== "active") return apiError("套餐不存在或已下架");
    plan = foundPlan;
    unitPrice = Math.ceil(foundPlan.price / foundPlan.maxBooks);
    deposit = foundPlan.deposit;
  } else {
    const plans = await db.subscriptionPlan.findMany({ where: { status: "active" }, take: 1 });
    unitPrice = plans.length > 0 ? Math.ceil(plans[0].price / plans[0].maxBooks) : 30;
  }

  const totalBooks = items.reduce((s, i) => s + i.quantity, 0);
  const totalAmount = unitPrice * totalBooks + deposit;

  const user = await db.user.findUnique({ where: { id: session.userId } });
  if (!user) return apiError("用户不存在");

  const orderNo = generateOrderNo();
  // 订阅借阅期：学期约 120 天
  const dueDate = new Date(Date.now() + 120 * 24 * 60 * 60 * 1000);

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
        note: deliveryType === "cabinet"
          ? `智能柜自取，柜格ID: ${cabinetSlotId}`
          : `宿舍配送：${dormitory} ${floor || ""}层 ${roomNumber}室`,
      },
    });

    // 创建订阅订单（如果有套餐）
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

    // 为每本教材分配具体副本
    for (const item of items) {
      const textbook = await tx.textbook.findUnique({ where: { id: item.textbookId } });
      if (!textbook) throw new Error(`教材 ${item.textbookId} 不存在`);

      const copies = await tx.textbookCopy.findMany({
        where: { textbookId: item.textbookId, status: "available" },
        orderBy: { condition: "asc" }, // 优先分配成色差的
        take: item.quantity,
      });

      if (copies.length < item.quantity) throw new Error(`《${textbook.title}》库存不足`);

      for (const copy of copies) {
        // 标记副本为已借出
        await tx.textbookCopy.update({
          where: { id: copy.id },
          data: {
            status: "borrowed",
            borrowerId: session.userId,
            borrowedAt: new Date(),
            dueDate,
          },
        });

        // 写入库存流转记录
        await tx.inventoryTransaction.create({
          data: {
            copyId: copy.id,
            fromStatus: "available",
            toStatus: "borrowed",
            operatorId: session.userId,
            detail: `订阅借出，应还日期：${dueDate.toLocaleDateString("zh-CN")}`,
          },
        });
      }

      // 创建订单明细（关联教材）
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
    action: planId ? "textbook_subscribe" : "textbook_purchase",
    targetType: "order",
    targetId: result.order.id,
    detail: `${planId ? "订阅" : "购买"} ${totalBooks} 本教材，金额 ¥${totalAmount}，应还：${dueDate.toLocaleDateString("zh-CN")}`,
  });

  await domainEvent({
    eventType: "order.created",
    aggregateType: "order",
    aggregateId: result.order.id,
    payload: { orderNo, totalAmount, totalBooks, dueDate: dueDate.toISOString() },
  });

  return apiSuccess(result.order);
}
