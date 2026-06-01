import { db } from "@/lib/db";
import { requireAuth } from "@/lib/api-helpers";
import { apiSuccess, apiError } from "@/lib/api-response";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAuth(req);

  const { id } = await params;

  try {
    const post = await db.forumPost.findUnique({
      where: { id, status: "active" },
      select: { id: true },
    });
    if (!post) return apiError("帖子不存在", 404);

    const existing = await db.forumFavorite.findUnique({
      where: { userId_postId: { userId: session.userId, postId: id } },
    });

    if (existing) {
      await db.forumFavorite.delete({ where: { id: existing.id } });
      return apiSuccess({ favorited: false });
    }

    await db.forumFavorite.create({
      data: { userId: session.userId, postId: id },
    });
    return apiSuccess({ favorited: true });
  } catch {
    return apiError("操作失败", 500);
  }
}
