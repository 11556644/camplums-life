import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { apiSuccess, apiError } from "@/lib/api-response";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return apiError("请先登录", 401);

  const { senderId } = await req.json();
  if (!senderId) return apiError("缺少 senderId");

  try {
    await db.message.updateMany({
      where: {
        senderId,
        receiverId: session.userId,
        type: "chat",
        readAt: null,
      },
      data: { readAt: new Date() },
    });
    return apiSuccess({ ok: true });
  } catch {
    return apiError("标记已读失败", 500);
  }
}
