export const dynamic = "force-dynamic";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { apiSuccess, apiError } from "@/lib/api-response";

export async function GET() {
  const session = await getSession();
  if (!session) return apiError("请先登录", 401);

  try {
    const chatMessages = await db.message.findMany({
      where: {
        type: "chat",
        OR: [
          { senderId: session.userId },
          { receiverId: session.userId },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    });

    const convMap = new Map<string, { otherUserId: string; lastMessage: string; lastTime: string; unread: number }>();

    for (const msg of chatMessages) {
      const otherUserId = msg.senderId === session.userId ? msg.receiverId : msg.senderId!;
      if (!convMap.has(otherUserId)) {
        convMap.set(otherUserId, {
          otherUserId,
          lastMessage: msg.content,
          lastTime: msg.createdAt.toISOString(),
          unread: 0,
        });
      }
      if (msg.receiverId === session.userId && !msg.readAt) {
        convMap.get(otherUserId)!.unread++;
      }
    }

    const conversations = Array.from(convMap.values()).sort(
      (a, b) => new Date(b.lastTime).getTime() - new Date(a.lastTime).getTime()
    );

    const userIds = conversations.map((c: any) => c.otherUserId);
    const users = await db.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, nickname: true, avatar: true, department: true },
    });
    const userMap = new Map(users.map((u: { id: string; nickname: string; avatar: string | null; department: string | null }) => [u.id, u]));

    const enriched = conversations.map((c: any) => ({
      ...c,
      user: userMap.get(c.otherUserId) || { id: c.otherUserId, nickname: "未知用户", avatar: null, department: null },
    }));

    return apiSuccess(enriched);
  } catch {
    return apiError("获取会话列表失败", 500);
  }
}
