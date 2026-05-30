export const dynamic = "force-dynamic";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { apiSuccess, apiError } from "@/lib/api-response";

export async function GET() {
  const session = await getSession();
  if (!session) return apiError("请先登录", 401);

  try {
    const messages = await db.message.findMany({
      where: { receiverId: session.userId, schoolId: session.schoolId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return apiSuccess(messages);
  } catch {
    return apiError("获取消息失败", 500);
  }
}
