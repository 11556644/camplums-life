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
    const comment = await db.forumComment.findUnique({
      where: { id, status: "active" },
      select: { id: true },
    });
    if (!comment) return apiError("评论不存在", 404);

    const existing = await db.forumLike.findUnique({
      where: { userId_commentId: { userId: session.userId, commentId: id } },
    });

    if (existing) {
      await db.$transaction(async (tx) => {
        await tx.forumLike.delete({ where: { id: existing.id } });
        await tx.forumComment.update({
          where: { id, likeCount: { gt: 0 } },
          data: { likeCount: { decrement: 1 } },
        });
      });
      const updated = await db.forumComment.findUnique({
        where: { id },
        select: { likeCount: true },
      });
      return apiSuccess({ liked: false, likeCount: updated?.likeCount ?? 0 });
    }

    await db.$transaction(async (tx) => {
      await tx.forumLike.create({
        data: { userId: session.userId, commentId: id },
      });
      await tx.forumComment.update({
        where: { id },
        data: { likeCount: { increment: 1 } },
      });
    });
    const updated = await db.forumComment.findUnique({
      where: { id },
      select: { likeCount: true },
    });
    return apiSuccess({ liked: true, likeCount: updated?.likeCount ?? 0 });
  } catch {
    return apiError("操作失败", 500);
  }
}
