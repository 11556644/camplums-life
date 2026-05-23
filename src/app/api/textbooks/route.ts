export const dynamic = "force-dynamic";
import { db } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api-response";

// 获取教材列表
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const department = searchParams.get("department");
  const q = searchParams.get("q")?.trim();

  const where: Record<string, unknown> = {
    ...(department ? { department } : {}),
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

    const enriched = textbooks.map((t: any) => ({
      ...t,
      availableCount: t.copies.filter((c) => c.status === "available").length,
      totalCount: t.copies.length,
    }));

    return apiSuccess(enriched);
  } catch {
    return apiError("获取教材列表失败", 500);
  }
}
