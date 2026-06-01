export const dynamic = "force-dynamic";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/api-helpers";
import { apiSuccess, apiError } from "@/lib/api-response";

// 获取当前用户的柜格寄存记录
export const GET = withAuth(async (req, session) => {
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
});
