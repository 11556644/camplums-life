export const dynamic = "force-dynamic";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { apiSuccess, apiError } from "@/lib/api-response";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return apiError("请先登录", 401);

  try {
    const user = await db.user.findUnique({
      where: { id: session.userId },
      select: { schoolId: true },
    });
    if (!user) return apiError("用户不存在", 404);

    const boards = await db.forumBoard.findMany({
      where: { schoolId: user.schoolId },
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        name: true,
        description: true,
        icon: true,
        sortOrder: true,
        postCount: true,
      },
    });

    return apiSuccess(boards);
  } catch {
    return apiError("获取板块列表失败", 500);
  }
}
