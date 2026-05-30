import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { auditLog } from "@/lib/logger";
import { apiSuccess, apiError } from "@/lib/api-response";
import { changeCredit } from "@/lib/credit";
import { z } from "zod";

const ratingSchema = z.object({
  score: z.number().int().min(1).max(5),
  content: z.string().optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return apiError("请先登录", 401);

  const { id } = await params;
  const body = await req.json();
  const parsed = ratingSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0].message);

  const order = await db.order.findUnique({ where: { id } });
  if (!order) return apiError("订单不存在", 404);
  if (order.status !== "completed") return apiError("只能评价已完成的订单");
  if (order.buyerId !== session.userId) return apiError("只有买家可以评价");

  const existing = await db.rating.findFirst({
    where: { orderId: id, raterId: session.userId },
  });
  if (existing) return apiError("已经评价过了");

  const rateeId = order.sellerId;

  const rating = await db.rating.create({
    data: {
      orderId: order.id,
      raterId: session.userId,
      rateeId,
      score: parsed.data.score,
      content: parsed.data.content,
    },
  });

  // 更新信用分（通过统一信用服务）
  if (parsed.data.score >= 4) {
    await changeCredit({
      userId: rateeId,
      schoolId: order.schoolId,
      delta: 3,
      reason: "收到好评",
      source: "rating",
      orderId: order.id,
    });
  } else if (parsed.data.score <= 2) {
    await changeCredit({
      userId: rateeId,
      schoolId: order.schoolId,
      delta: -5,
      reason: "收到差评",
      source: "rating",
      orderId: order.id,
    });
  }

  await auditLog({
    userId: session.userId,
    action: "rating_create",
    targetType: "order",
    targetId: order.id,
    detail: `Rating ${parsed.data.score}/5 for order ${order.orderNo}`,
  });

  return apiSuccess(rating);
}
