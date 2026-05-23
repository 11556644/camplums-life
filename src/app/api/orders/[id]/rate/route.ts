import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { auditLog } from "@/lib/logger";
import { apiSuccess, apiError } from "@/lib/api-response";
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

  // 更新信用分（带上下限保护 0-200）
  const credit = await db.creditScore.findUnique({ where: { userId: rateeId } });
  if (credit) {
    const delta = parsed.data.score >= 4 ? 2 : parsed.data.score >= 3 ? 0 : -3;
    const newScore = Math.min(200, Math.max(0, credit.score + delta));
    await db.creditScore.update({ where: { userId: rateeId }, data: { score: newScore } });
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
