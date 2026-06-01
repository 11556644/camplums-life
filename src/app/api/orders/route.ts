export const dynamic = "force-dynamic";
import { withAuth } from "@/lib/api-helpers";
import { db } from "@/lib/db";
import { auditLog, domainEvent } from "@/lib/logger";
import { apiSuccess, apiError } from "@/lib/api-response";
import { publishEvent } from "@/lib/realtime";
import { generateOrderNo, ORDER_STATUS } from "@/lib/order-state-machine";
import { z } from "zod";

const createOrderSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().min(1).default(1),
  note: z.string().optional(),
  deliveryMethod: z.enum(["cabinet", "face_to_face"]).optional(),
  cabinetSlotId: z.string().optional(),
  cabinetDuration: z.number().int().min(30).max(1440).default(120),
});

export const GET = withAuth(async (req, session) => {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const role = searchParams.get("role") || "buyer"; // buyer or seller
  const orderType = searchParams.get("orderType");

  const where = {
    ...(role === "buyer" ? { buyerId: session.userId } : { sellerId: session.userId }),
    ...(status ? { status } : {}),
    ...(orderType ? { orderType } : {}),
  };

  try {
    const orders = await db.order.findMany({
      where,
      include: {
        items: {
          include: {
            product: { select: { title: true, images: true } },
            task: { select: { title: true } },
          },
        },
        payments: { where: { status: "success" }, take: 1 },
      },
      orderBy: { createdAt: "desc" },
    });

    return apiSuccess(orders);
  } catch (error) {
    return apiError("获取订单列表失败", 500);
  }
});

export const POST = withAuth(async (req, session) => {
  try {
    const body = await req.json();
    const parsed = createOrderSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(parsed.error.issues[0].message);
    }

    const { productId, quantity, note, deliveryMethod, cabinetSlotId, cabinetDuration } = parsed.data;

    const product = await db.product.findUnique({
      where: { id: productId },
    });

    if (!product) return apiError("商品不存在", 404);
    if (product.status !== "active") return apiError("商品已下架");
    if (product.sellerId === session.userId) return apiError("不能购买自己的商品");

    // 校验交收方式
    const method = deliveryMethod || (product.faceToFaceDelivery ? "face_to_face" : "cabinet");
    if (method === "cabinet" && !product.cabinetDelivery) return apiError("该商品不支持智能柜交收");
    if (method === "face_to_face" && !product.faceToFaceDelivery) return apiError("该商品不支持面对面交易");
    if (method === "cabinet" && !cabinetSlotId) return apiError("智能柜交收请选择柜格");

    // 计算费用分摊
    const { calculateTradeDeliveryFee } = await import("@/lib/pricing");
    const feeSplit = method === "cabinet" ? calculateTradeDeliveryFee(cabinetDuration) : { sellerPays: 0, buyerPays: 0 };
    const totalAmount = product.price * quantity + feeSplit.buyerPays;
    const orderNo = generateOrderNo();

    // 事务内创建订单 + 预留商品（防双卖）+ 预留柜格
    const order = await db.$transaction(async (tx: any) => {
      // 条件更新：只有 active 状态才能下单
      const updated = await tx.product.update({
        where: { id: productId, status: "active" },
        data: { status: "under_review" },
      });
      if (!updated) throw new Error("商品已被他人抢先下单");

      const orderNote = method === "cabinet"
        ? `智能柜交收，时长${cabinetDuration}分钟，卖家付¥${feeSplit.sellerPays}，买家付¥${feeSplit.buyerPays}${note ? "，" + note : ""}`
        : note;

      const order = await tx.order.create({
        data: {
          orderNo,
          schoolId: product.schoolId,
          buyerId: session.userId,
          sellerId: product.sellerId,
          orderType: "product",
          bizType: "trade",
          status: ORDER_STATUS.PENDING_PAYMENT,
          totalAmount,
          note: orderNote,
          deliveryMethod: method,
          items: {
            create: {
              productId: product.id,
              quantity,
              unitPrice: product.price,
              totalPrice: totalAmount,
            },
          },
        },
        include: { items: true },
      });

      // 智能柜预留：下单时立即锁定柜格（参照教材订阅逻辑）
      if (method === "cabinet" && cabinetSlotId) {
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
        const binding = await tx.cabinetSlotOrder.create({
          data: {
            slotId: cabinetSlotId,
            orderId: order.id,
            depositType: "trade",
            pickupCode,
            status: "active",
            depositorId: session.userId,
            durationHours: Math.ceil(cabinetDuration / 60),
          },
        });

        console.log(`[cabinet-reserve] Order ${orderNo}: slot ${slot.cabinet.name}#${slot.slotNumber} reserved, binding=${binding.id}, duration=${cabinetDuration}min, pickup=${pickupCode}`);

        await tx.cabinetSlotLog.create({
          data: {
            slotId: cabinetSlotId,
            action: "reserve",
            operatorId: session.userId,
            detail: `商品交易预留柜格，订单号：${orderNo}，柜机：${slot.cabinet.name} #${slot.slotNumber}，时长${cabinetDuration}分钟`,
          },
        });
      }

      return order;
    }).catch((err: Error) => {
      if (err.message === "商品已被他人抢先下单" || err.message === "柜格不存在" || err.message === "该柜格已被占用") return null;
      throw err;
    });

    if (!order) return apiError("下单失败，商品已被抢或柜格不可用，请刷新");

    await auditLog({
      userId: session.userId,
      action: "order_create",
      targetType: "order",
      targetId: order.id,
      detail: `Created order ${orderNo} for product ${product.title}`,
    });

    await domainEvent({
      userId: session.userId,
      eventType: "order.created",
      aggregateType: "order",
      aggregateId: order.id,
      payload: { orderNo, productId, totalAmount },
    });

    // 通知卖家有新订单
    const buyer = await db.user.findUnique({ where: { id: session.userId }, select: { nickname: true } });
    await db.message.create({
      data: {
        schoolId: product.schoolId,
        senderId: session.userId,
        receiverId: product.sellerId,
        type: "notification",
        title: "新订单通知",
        content: `${buyer?.nickname || "买家"} 购买了您的「${product.title}」，订单号 ${orderNo}，金额 ¥${totalAmount}。`,
      },
    });

    // 实时推送给卖家
    publishEvent({
      type: "order",
      action: "created",
      targetId: order.id,
      userId: session.userId,
      data: { orderNo, productTitle: product.title, totalAmount },
    }, [product.sellerId]);

    return apiSuccess(order);
  } catch (error) {
    return apiError("创建订单失败", 500);
  }
});
