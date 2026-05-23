export const dynamic = "force-dynamic";
import { db } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api-response";

// 教材详情（含副本列表）
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const textbook = await db.textbook.findUnique({
      where: { id },
      include: {
        copies: {
          orderBy: { condition: "asc" },
        },
      },
    });

    if (!textbook) return apiError("教材不存在", 404);

    // 统计副本状态分布
    const statusCounts = {
      available: 0,
      borrowed: 0,
      sanitizing: 0,
      retired: 0,
    };
    const conditionCounts: Record<string, number> = {};

    for (const copy of textbook.copies) {
      statusCounts[copy.status as keyof typeof statusCounts] = (statusCounts[copy.status as keyof typeof statusCounts] || 0) + 1;
      conditionCounts[copy.condition] = (conditionCounts[copy.condition] || 0) + 1;
    }

    return apiSuccess({
      ...textbook,
      statusCounts,
      conditionCounts,
      availableCount: statusCounts.available,
      totalCount: textbook.copies.length,
    });
  } catch {
    return apiError("获取教材详情失败", 500);
  }
}
