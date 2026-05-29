export const dynamic = "force-dynamic";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { apiSuccess, apiError } from "@/lib/api-response";
import { z } from "zod";

const commentSchema = z.object({
  content: z.string().min(1, "评论不能为空").max(10000, "评论最多10000字"),
  parentId: z.string().optional(),
  isAnonymous: z.boolean().optional().default(false),
});

const ANONYMOUS_AUTHOR = {
  id: null,
  nickname: "匿名用户",
  avatar: null,
  department: null,
};

function maskComment(comment: Record<string, unknown>) {
  return {
    ...comment,
    author: comment.isAnonymous ? ANONYMOUS_AUTHOR : comment.author,
    replies: Array.isArray(comment.replies)
      ? (comment.replies as Record<string, unknown>[]).map((r) => ({
          ...r,
          author: r.isAnonymous ? ANONYMOUS_AUTHOR : r.author,
        }))
      : [],
  };
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getSession();

  try {
    const post = await db.forumPost.findUnique({
      where: { id, status: "active" },
      include: {
        author: {
          select: { id: true, nickname: true, avatar: true, department: true },
        },
        board: { select: { id: true, name: true } },
        comments: {
          where: { status: "active", parentId: null },
          orderBy: { createdAt: "asc" },
          include: {
            author: {
              select: { id: true, nickname: true, avatar: true, department: true },
            },
            replies: {
              where: { status: "active" },
              orderBy: { createdAt: "asc" },
              include: {
                author: {
                  select: { id: true, nickname: true, avatar: true, department: true },
                },
              },
            },
            _count: { select: { likes: true } },
          },
        },
        _count: { select: { likes: true, favorites: true } },
      },
    });

    if (!post) return apiError("帖子不存在", 404);

    // Increment view count (fire-and-forget)
    db.forumPost.update({
      where: { id },
      data: { viewCount: { increment: 1 } },
    }).catch(() => {});

    // Check if current user liked/favorited
    let isLiked = false;
    let isFavorited = false;
    let likedCommentIds: string[] = [];

    if (session) {
      const [like, favorite, commentLikes] = await Promise.all([
        db.forumLike.findUnique({
          where: { userId_postId: { userId: session.userId, postId: id } },
        }),
        db.forumFavorite.findUnique({
          where: { userId_postId: { userId: session.userId, postId: id } },
        }),
        db.forumLike.findMany({
          where: { userId: session.userId, commentId: { not: null } },
          select: { commentId: true },
        }),
      ]);
      isLiked = !!like;
      isFavorited = !!favorite;
      likedCommentIds = commentLikes
        .map((l) => l.commentId)
        .filter((c): c is string => c !== null);
    }

    // Mask anonymous authors
    const maskedPost = {
      ...post,
      images: post.images ? JSON.parse(post.images) : [],
      author: post.isAnonymous ? ANONYMOUS_AUTHOR : post.author,
      viewCount: post.viewCount + 1,
      isLiked,
      isFavorited,
      comments: post.comments.map((comment) => {
        const masked = maskComment(comment as unknown as Record<string, unknown>);
        return {
          ...masked,
          _count: comment._count,
          isLiked: likedCommentIds.includes(comment.id),
          replies: (masked.replies as Record<string, unknown>[]).map((r) => ({
            ...r,
            isLiked: likedCommentIds.includes(r.id as string),
          })),
        };
      }),
    };

    return apiSuccess(maskedPost);
  } catch {
    return apiError("获取帖子详情失败", 500);
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return apiError("请先登录", 401);

  const { id } = await params;
  const body = await req.json();
  const parsed = commentSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0].message);

  try {
    const post = await db.forumPost.findUnique({
      where: { id, status: "active" },
      select: { id: true },
    });
    if (!post) return apiError("帖子不存在", 404);

    // If replying to a comment, validate parent exists and belongs to this post
    if (parsed.data.parentId) {
      const parent = await db.forumComment.findUnique({
        where: { id: parsed.data.parentId },
        select: { postId: true, status: true },
      });
      if (!parent || parent.postId !== id || parent.status !== "active") {
        return apiError("回复的评论不存在");
      }
    }

    const comment = await db.$transaction(async (tx) => {
      const newComment = await tx.forumComment.create({
        data: {
          postId: id,
          authorId: session.userId,
          parentId: parsed.data.parentId || null,
          content: parsed.data.content,
          isAnonymous: parsed.data.isAnonymous,
        },
        include: {
          author: {
            select: { id: true, nickname: true, avatar: true, department: true },
          },
        },
      });

      await tx.forumPost.update({
        where: { id },
        data: { commentCount: { increment: 1 } },
      });

      return newComment;
    });

    const masked = {
      ...comment,
      author: comment.isAnonymous ? ANONYMOUS_AUTHOR : comment.author,
    };

    return apiSuccess(masked);
  } catch {
    return apiError("评论失败", 500);
  }
}
