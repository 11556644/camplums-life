import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { apiSuccess, apiError } from "@/lib/api-response";

export async function GET() {
  const session = await getSession();
  if (!session) return apiError("请先登录", 401);

  try {
    const [unreadMessages, unreadChats] = await Promise.all([
      db.message.count({
        where: {
          receiverId: session.userId,
          type: { in: ["system", "order", "notification"] },
          readAt: null,
        },
      }),
      db.message.count({
        where: {
          receiverId: session.userId,
          type: "chat",
          readAt: null,
        },
      }),
    ]);

    return apiSuccess({
      total: unreadMessages + unreadChats,
      messages: unreadMessages,
      chats: unreadChats,
    });
  } catch {
    return apiError("获取未读计数失败", 500);
  }
}
