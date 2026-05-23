export const dynamic = "force-dynamic";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { maskPhone, maskDormitory } from "@/lib/privacy";
import { apiSuccess, apiError } from "@/lib/api-response";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();

  try {
    const user = await db.user.findUnique({
      where: { id },
      include: {
        roles: true,
        creditScore: true,
        products: { where: { status: "active" }, orderBy: { createdAt: "desc" }, take: 20 },
        tasks: { where: { status: "open" }, orderBy: { createdAt: "desc" }, take: 20 },
        receivedRatings: {
          include: { rater: { select: { nickname: true } }, order: { select: { orderNo: true } } },
          orderBy: { createdAt: "desc" },
          take: 20,
        },
      },
    });
    if (!user) return apiError("用户不存在", 404);

    const isSelf = session?.userId === user.id;

    // 非本人查看时，检查是否有已完成的订单关系
    let showRoom = false;
    if (!isSelf && session) {
      const completedOrder = await db.order.findFirst({
        where: {
          status: "completed",
          OR: [
            { buyerId: session.userId, sellerId: id },
            { sellerId: session.userId, buyerId: id },
          ],
        },
      });
      showRoom = !!completedOrder;
    }

    const avgRating = user.receivedRatings.length > 0
      ? user.receivedRatings.reduce((s, r) => s + r.score, 0) / user.receivedRatings.length
      : null;

    const { passwordHash, roomNumber, phone, ...base } = user;

    return apiSuccess({
      ...base,
      dormitory: maskDormitory(user.dormitory, showRoom || isSelf ? roomNumber : null, showRoom || isSelf),
      // 非本人不暴露手机号和房间号
      ...(isSelf ? { phone, roomNumber } : {}),
      avgRating,
    });
  } catch {
    return apiError("获取用户信息失败", 500);
  }
}
