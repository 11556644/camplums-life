export const dynamic = "force-dynamic";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { apiSuccess, apiError } from "@/lib/api-response";

export async function GET() {
  const session = await getSession();
  if (!session) return apiError("请先登录", 401);

  const isAdmin = await db.userRole.findFirst({ where: { userId: session.userId, role: "admin" } });
  if (!isAdmin) return apiError("无权限", 403);

  try {
    const [cabinets, totalSlots, occupiedSlots, faultSlots, expiredBindings, allBindings] = await Promise.all([
      db.cabinet.findMany({
        include: { slots: true },
        orderBy: { name: "asc" },
      }),
      db.cabinetSlot.count(),
      db.cabinetSlot.count({ where: { status: "occupied" } }),
      db.cabinetSlot.count({ where: { status: "fault" } }),
      db.cabinetSlotOrder.count({ where: { status: "expired" } }),
      db.cabinetSlotOrder.findMany({
        where: { status: "retrieved", retrievedAt: { not: null } },
        select: { depositedAt: true, retrievedAt: true, depositType: true },
      }),
    ]);

    // 按柜机统计
    const cabinetStats = cabinets.map((c: { id: string; name: string; location: string; status: string; slots: { status: string }[] }) => {
      const total = c.slots.length;
      const occupied = c.slots.filter((s: any) => s.status === "occupied").length;
      const fault = c.slots.filter((s: any) => s.status === "fault").length;
      const empty = c.slots.filter((s: any) => s.status === "empty").length;
      return {
        id: c.id,
        name: c.name,
        location: c.location,
        status: c.status,
        total,
        occupied,
        fault,
        empty,
        usageRate: total > 0 ? Math.round((occupied / total) * 100) : 0,
      };
    });

    // 平均周转时间
    const turnoverTimes = allBindings
      .filter((b: { retrievedAt: Date | null }) => b.retrievedAt)
      .map((b: any) => b.retrievedAt.getTime() - b.depositedAt.getTime());
    const avgTurnoverHours = turnoverTimes.length > 0
      ? Math.round(turnoverTimes.reduce((s: number, t: number) => s + t, 0) / turnoverTimes.length / (1000 * 60 * 60) * 10) / 10
      : 0;

    // 交易成功率
    const totalTradeBindings = await db.cabinetSlotOrder.count({ where: { depositType: "trade" } });
    const successfulTradeBindings = await db.cabinetSlotOrder.count({ where: { depositType: "trade", status: "retrieved" } });
    const tradeSuccessRate = totalTradeBindings > 0 ? Math.round((successfulTradeBindings / totalTradeBindings) * 100) : 0;

    return apiSuccess({
      overview: {
        totalSlots,
        occupiedSlots,
        faultSlots,
        emptySlots: totalSlots - occupiedSlots - faultSlots,
        usageRate: totalSlots > 0 ? Math.round((occupiedSlots / totalSlots) * 100) : 0,
        avgTurnoverHours,
        expiredCount: expiredBindings,
        tradeSuccessRate,
      },
      cabinets: cabinetStats,
    });
  } catch {
    return apiError("获取柜格数据失败", 500);
  }
}
