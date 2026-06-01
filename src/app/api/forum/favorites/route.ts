export const dynamic = "force-dynamic";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/api-helpers";
import { apiSuccess, apiError } from "@/lib/api-response";

export const GET = withAuth(async (req, session) => {
  const favorites = await db.forumFavorite.findMany({
    where: { userId: session.userId },
    include: {
      post: {
        select: {
          id: true,
          title: true,
          content: true,
          viewCount: true,
          likeCount: true,
          commentCount: true,
          createdAt: true,
          board: { select: { id: true, name: true } },
          author: { select: { id: true, nickname: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const posts = favorites.map((f) => ({
    id: f.post.id,
    title: f.post.title,
    content: f.post.content.slice(0, 100),
    viewCount: f.post.viewCount,
    likeCount: f.post.likeCount,
    commentCount: f.post.commentCount,
    createdAt: f.post.createdAt,
    board: f.post.board,
    author: f.post.author,
    favoritedAt: f.createdAt,
  }));

  return apiSuccess(posts);
});
