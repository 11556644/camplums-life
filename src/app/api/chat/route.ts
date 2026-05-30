import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { apiSuccess, apiError } from "@/lib/api-response";
import { publishEvent } from "@/lib/realtime";

// 获取与某人的聊天记录
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return apiError("请先登录", 401);

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
}

// 发送消息（支持文字和图片）
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return apiError("请先登录", 401);

  const body = await req.json();
  const { receiverId, content, images, orderId, productId } = body;
  if (!receiverId) return apiError("缺少 receiverId");
  if (!content?.trim() && (!images || images.length === 0)) return apiError("消息内容不能为空");

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

  // 实时推送给接收者（携带完整消息体，客户端无需再请求）
  publishEvent({
    type: "message",
    action: "new_message",
    targetId: message.id,
    userId: session.userId,
    data: { message },
  }, [receiverId]);

  return apiSuccess(message);
}
