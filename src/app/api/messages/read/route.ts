import { db } from "@/lib/db";
import { withAuth } from "@/lib/api-helpers";
import { apiSuccess, apiError } from "@/lib/api-response";
import { markChatReadSchema } from "@/lib/schemas";

// POST: 标记指定发送者的聊天消息为已读
export const POST = withAuth(async (req, session) => {
  const body = await req.json();
  const parsed = markChatReadSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0].message);

  const { senderId } = parsed.data;

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
});

// PATCH: 标记所有通知类消息为已读
export const PATCH = withAuth(async (req, session) => {
  await db.message.updateMany({
    where: {
      receiverId: session.userId,
      type: { in: ["system", "order", "notification"] },
      readAt: null,
    },
    data: { readAt: new Date() },
  });
  return apiSuccess({ ok: true });
});
