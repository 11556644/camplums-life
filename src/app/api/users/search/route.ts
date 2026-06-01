export const dynamic = "force-dynamic";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/api-helpers";
import { apiSuccess, apiError } from "@/lib/api-response";
import { sanitizeSearchQuery } from "@/lib/search";

// 搜索用户（用于发起新对话）
export const GET = withAuth(async (req, session) => {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();
  if (!q || q.length < 1) return apiSuccess([]);

  const sanitized = sanitizeSearchQuery(q);

  const users = await db.user.findMany({
    where: {
      id: { not: session.userId },
      status: "active",
      OR: [
        { nickname: { contains: sanitized, mode: "insensitive" } },
        { phone: { contains: sanitized, mode: "insensitive" } },
        { studentId: { contains: sanitized, mode: "insensitive" } },
        { department: { contains: sanitized, mode: "insensitive" } },
      ],
    },
    select: { id: true, nickname: true, department: true },
    take: 10,
  });

  return apiSuccess(users);
});
