import { db } from "@/lib/db";
import { withAuth } from "@/lib/api-helpers";
import { apiSuccess, apiError } from "@/lib/api-response";

export const GET = withAuth(async (req, session) => {
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
});
