import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { apiSuccess, apiError } from "@/lib/api-response";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return apiError("请先登录", 401);

  const { id } = await params;

  try {
    const post = await db.forumPost.findUnique({
      where: { id, status: "active" },
      select: { id: true },
    });
    if (!post) return apiError("帖子不存在", 404);

    const existing = await db.forumLike.findUnique({
      where: { userId_postId: { userId: session.userId, postId: id } },
    });

    if (existing) {
      await db.$transaction(async (tx) => {
        await tx.forumLike.delete({ where: { id: existing.id } });
        await tx.forumPost.update({
          where: { id },
          data: { likeCount: { decrement: 1 } },
        });
      });
      const post = await db.forumPost.findUnique({
        where: { id },
        select: { likeCount: true },
      });
      return apiSuccess({ liked: false, likeCount: post?.likeCount ?? 0 });
    }

    await db.$transaction(async (tx) => {
      await tx.forumLike.create({
        data: { userId: session.userId, postId: id },
      });
      await tx.forumPost.update({
        where: { id },
        data: { likeCount: { increment: 1 } },
      });
    });
    const updated = await db.forumPost.findUnique({
      where: { id },
      select: { likeCount: true },
    });
    return apiSuccess({ liked: true, likeCount: updated?.likeCount ?? 0 });
  } catch {
    return apiError("操作失败", 500);
  }
}
