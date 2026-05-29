export const dynamic = "force-dynamic";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { apiSuccess, apiError } from "@/lib/api-response";

export async function GET() {
  try {
    const session = await getSession();
    let schoolId: string | undefined;

    if (session) {
      const user = await db.user.findUnique({
        where: { id: session.userId },
        select: { schoolId: true },
      });
      schoolId = user?.schoolId;
    }

    // 未登录时返回默认学校板块
    if (!schoolId) {
      const school = await db.school.findFirst({ select: { id: true } });
      schoolId = school?.id;
    }

    if (!schoolId) return apiSuccess([]);

    const boards = await db.forumBoard.findMany({
      where: { schoolId },
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
