import { db } from "@/lib/db";
import { withAuth } from "@/lib/api-helpers";
import { apiSuccess, apiError } from "@/lib/api-response";
import { publishEvent } from "@/lib/realtime";
import { sendMessageSchema } from "@/lib/schemas";

// 获取与某人的聊天记录
export const GET = withAuth(async (req, session) => {
  const { searchParams } = new URL(req.url);
  const otherUserId = searchParams.get("userId");
  if (!otherUserId) return apiError("缺少 userId");

  const messages = await db.message.findMany({
    where: {
      type: "chat",
      OR: [
        { senderId: session.userId, receiverId: otherUserId },
        { senderId: otherUserId, receiverId: session.userId },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: 200,
  });

  return apiSuccess(messages);
});

// 发送消息（支持文字和图片）
export const POST = withAuth(async (req, session) => {
  const body = await req.json();
  const parsed = sendMessageSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0].message);

  const { receiverId, content, images, orderId, productId } = parsed.data;

  const user = await db.user.findUnique({ where: { id: session.userId } });
  if (!user) return apiError("用户不存在");

  const metadata: Record<string, unknown> = {};
  if (images && images.length > 0) metadata.images = images;
  if (orderId) metadata.orderId = orderId;
  if (productId) metadata.productId = productId;

  const message = await db.message.create({
    data: {
      schoolId: user.schoolId,
      senderId: session.userId,
      receiverId,
      type: "chat",
      content: content?.trim() || "[图片]",
      metadata: Object.keys(metadata).length > 0 ? JSON.stringify(metadata) : null,
    },
  });

  publishEvent({
    type: "message",
    action: "new_message",
    targetId: message.id,
    userId: session.userId,
    data: { message },
  }, [receiverId]);

  return apiSuccess(message);
});
