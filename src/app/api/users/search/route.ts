export const dynamic = "force-dynamic";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { apiSuccess, apiError } from "@/lib/api-response";

// 搜索用户（用于发起新对话）
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return apiError("请先登录", 401);

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();
  if (!q || q.length < 1) return apiSuccess([]);

  try {
    const users = await db.user.findMany({
      where: {
        id: { not: session.userId },
        status: "active",
        OR: [
          { nickname: { contains: q } },
          { phone: { contains: q } },
          { studentId: { contains: q } },
          { department: { contains: q } },
        ],
      },
      select: { id: true, nickname: true, department: true },
      take: 10,
    });

    return apiSuccess(users);
  } catch {
    return apiError("搜索失败", 500);
  }
}
