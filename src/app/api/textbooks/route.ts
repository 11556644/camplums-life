export const dynamic = "force-dynamic";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { apiSuccess, apiError } from "@/lib/api-response";

// 获取教材列表
export async function GET(req: Request) {
  const session = await getSession();
  const { searchParams } = new URL(req.url);
  const department = searchParams.get("department");
  const q = searchParams.get("q")?.trim();

  const where: Record<string, unknown> = {
    ...(department ? { department } : {}),
    ...(session?.schoolId ? { schoolId: session.schoolId } : {}),
  };
  if (q) {
    where.OR = [
      { title: { contains: q } },
      { author: { contains: q } },
      { isbn: { contains: q } },
      { course: { contains: q } },
    ];
  }

  try {
    const textbooks = await db.textbook.findMany({
      where,
      include: {
        copies: { select: { id: true, condition: true, status: true } },
      },
      orderBy: { title: "asc" },
    });

    const enriched = textbooks.map((t: any) => {
      const available = t.copies.filter((c: any) => c.status === "available");
      // 可用副本中最好的成色（用于定价基准）
      const conditionOrder = ["new", "like_new", "good", "acceptable"];
      const bestCondition = available.length > 0
        ? available.sort((a: any, b: any) => conditionOrder.indexOf(a.condition) - conditionOrder.indexOf(b.condition))[0].condition
        : "good";
      return {
        ...t,
        availableCount: available.length,
        totalCount: t.copies.length,
        bestCondition,
      };
    });

    return apiSuccess(enriched);
  } catch {
    return apiError("获取教材列表失败", 500);
  }
}
