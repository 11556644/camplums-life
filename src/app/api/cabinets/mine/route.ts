export const dynamic = "force-dynamic";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { apiSuccess, apiError } from "@/lib/api-response";

// 获取当前用户的柜格寄存记录
export async function GET() {
  const session = await getSession();
  if (!session) return apiError("请先登录", 401);

  try {
    const bindings = await db.cabinetSlotOrder.findMany({
      where: {
        depositorId: session.userId,
        status: { in: ["active", "retrieved", "expired"] },
      },
      include: {
        slot: { include: { cabinet: { select: { name: true, location: true } } } },
      },
      orderBy: { depositedAt: "desc" },
      take: 20,
    });

    return apiSuccess(bindings);
  } catch {
    return apiError("获取寄存记录失败", 500);
  }
}
