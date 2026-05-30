export const dynamic = "force-dynamic";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { apiSuccess, apiError } from "@/lib/api-response";
import { broadcastEvent } from "@/lib/realtime";
import { buildSearchFilter, sortByRelevance } from "@/lib/search";
import { z } from "zod";

const createPostSchema = z.object({
  boardId: z.string().min(1),
  title: z.string().min(1, "标题不能为空").max(200, "标题最多200字"),
  content: z.string().min(1, "内容不能为空").max(50000, "内容最多50000字"),
  images: z.array(z.string()).optional(),
  isAnonymous: z.boolean().optional().default(false),
});

export async function GET(req: Request) {
  const session = await getSession();
  const { searchParams } = new URL(req.url);
  const boardId = searchParams.get("boardId");
  const q = searchParams.get("q")?.trim();
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "20")));

  try {
    const where: Record<string, unknown> = {
      status: "active",
      ...(boardId ? { boardId } : {}),
      ...(session?.schoolId ? { schoolId: session.schoolId } : {}),
    };
    if (q) {
      const searchFilter = buildSearchFilter(q, [
        { field: "title" },
        { field: "content" },
      ]);
      if (searchFilter) Object.assign(where, searchFilter);
    }

    const [posts, total] = await Promise.all([
      db.forumPost.findMany({
        where,
        include: {
          author: {
            select: { id: true, nickname: true, avatar: true, department: true },
          },
          board: { select: { id: true, name: true } },
          _count: { select: { comments: true, likes: true } },
        },
        orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.forumPost.count({ where }),
    ]);

    const masked = posts.map((post) => ({
      ...post,
      images: post.images ? JSON.parse(post.images) : [],
      author: post.isAnonymous
        ? { id: null, nickname: "匿名用户", avatar: null, department: null }
        : post.author,
    }));

    return apiSuccess({ posts: masked, total, page, limit });
  } catch {
    return apiError("获取帖子列表失败", 500);
  }
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return apiError("请先登录", 401);

  const body = await req.json();
  const parsed = createPostSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0].message);

  try {
    const user = await db.user.findUnique({
      where: { id: session.userId },
      select: { schoolId: true },
    });
    if (!user) return apiError("用户不存在", 404);

    const board = await db.forumBoard.findUnique({
      where: { id: parsed.data.boardId },
    });
    if (!board) return apiError("板块不存在", 404);
    if (board.schoolId !== user.schoolId) return apiError("无权在此板块发帖");

    const post = await db.$transaction(async (tx) => {
      const newPost = await tx.forumPost.create({
        data: {
          schoolId: user.schoolId,
          boardId: parsed.data.boardId,
          authorId: session.userId,
          title: parsed.data.title,
          content: parsed.data.content,
          images: parsed.data.images?.length
            ? JSON.stringify(parsed.data.images)
            : null,
          isAnonymous: parsed.data.isAnonymous,
        },
        include: {
          author: {
            select: { id: true, nickname: true, avatar: true, department: true },
          },
          board: { select: { id: true, name: true } },
        },
      });

      await tx.forumBoard.update({
        where: { id: parsed.data.boardId },
        data: { postCount: { increment: 1 } },
      });

      return newPost;
    });

    broadcastEvent({
      type: "forum",
      action: "new_post",
      targetId: post.id,
      userId: session.userId,
      data: { title: post.title, boardId: post.boardId },
    });

    return apiSuccess({
      ...post,
      images: post.images ? JSON.parse(post.images) : [],
    });
  } catch {
    return apiError("发帖失败", 500);
  }
}
