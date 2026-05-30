export const dynamic = "force-dynamic";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { apiSuccess, apiError } from "@/lib/api-response";
import { maskLocation } from "@/lib/privacy";

// 获取所有任务
export async function GET(req: Request) {
  const session = await getSession();
  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type");
  const q = searchParams.get("q")?.trim();
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "20");

  const where: Record<string, unknown> = {
    status: "open",
    ...(type ? { type } : {}),
    ...(session?.schoolId ? { schoolId: session.schoolId } : {}),
  };
  if (q) {
    where.OR = [
      { title: { contains: q } },
      { description: { contains: q } },
    ];
  }

  try {
    const [tasks, total] = await Promise.all([
      db.task.findMany({
        where,
        include: {
          publisher: { select: { id: true, nickname: true, dormitory: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.task.count({ where }),
    ]);

    const masked = tasks.map((t: any) => ({
      ...t,
      location: maskLocation(t.location),
      publisher: { ...t.publisher, dormitory: maskLocation(t.publisher.dormitory) },
    }));

    return apiSuccess({ tasks: masked, total, page, limit });
  } catch {
    return apiError("获取任务列表失败", 500);
  }
}
