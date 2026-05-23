export const dynamic = "force-dynamic";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { auditLog, domainEvent } from "@/lib/logger";
import { apiSuccess, apiError } from "@/lib/api-response";
import { generateOrderNo, ORDER_STATUS } from "@/lib/order-state-machine";
import { z } from "zod";

const createOrderSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().min(1).default(1),
  note: z.string().optional(),
  cabinetId: z.string().optional(), // 可选：指定智能柜交收
});

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return apiError("请先登录", 401);

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const role = searchParams.get("role") || "buyer"; // buyer or seller

  const where = {
    ...(role === "buyer" ? { buyerId: session.userId } : { sellerId: session.userId }),
    ...(status ? { status } : {}),
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
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return apiError("请先登录", 401);

  try {
    const body = await req.json();
    const parsed = createOrderSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(parsed.error.issues[0].message);
    }

    const { productId, quantity, note } = parsed.data;

    const product = await db.product.findUnique({
      where: { id: productId },
    });

    if (!product) return apiError("商品不存在", 404);
    if (product.status !== "active") return apiError("商品已下架");
    if (product.sellerId === session.userId) return apiError("不能购买自己的商品");

    const totalAmount = product.price * quantity;
    const orderNo = generateOrderNo();

    const order = await db.order.create({
      data: {
        orderNo,
        schoolId: product.schoolId,
        buyerId: session.userId,
        sellerId: product.sellerId,
        orderType: "product",
        bizType: "trade",
        status: ORDER_STATUS.PENDING_PAYMENT,
        totalAmount,
        note,
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

    await auditLog({
      userId: session.userId,
      action: "order_create",
      targetType: "order",
      targetId: order.id,
      detail: `Created order ${orderNo} for product ${product.title}`,
    });

    await domainEvent({
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

    return apiSuccess(order);
  } catch (error) {
    return apiError("创建订单失败", 500);
  }
}
