export const dynamic = "force-dynamic";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { apiSuccess, apiError } from "@/lib/api-response";

// 获取待消毒/待质检的教材副本
export async function GET() {
  const session = await getSession();
  if (!session) return apiError("请先登录", 401);

  const isAdmin = await db.userRole.findFirst({ where: { userId: session.userId, role: "admin" } });
  if (!isAdmin) return apiError("无权限", 403);

  try {
    const copies = await db.textbookCopy.findMany({
      where: { status: { in: ["sanitizing", "borrowed"] } },
      include: {
        textbook: { select: { id: true, title: true, author: true, isbn: true } },
        inspectionRecords: { orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: { updatedAt: "asc" },
    });

    return apiSuccess(copies);
  } catch {
    return apiError("获取教材列表失败", 500);
  }
}
