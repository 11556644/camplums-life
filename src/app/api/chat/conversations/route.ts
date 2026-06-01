export const dynamic = "force-dynamic";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/api-helpers";
import { apiSuccess, apiError } from "@/lib/api-response";

export const GET = withAuth(async (_req, session) => {
  try {
    // DB 层聚合：单次 SQL 完成会话分组 + 最新消息 + 未读计数
    const rows = await db.$queryRaw`
      WITH ranked AS (
        SELECT
          CASE WHEN "senderId" = ${session.userId} THEN "receiverId" ELSE "senderId" END AS "otherUserId",
          content AS "lastMessage",
          "createdAt" AS "lastTime",
          ROW_NUMBER() OVER (
            PARTITION BY CASE WHEN "senderId" = ${session.userId} THEN "receiverId" ELSE "senderId" END
            ORDER BY "createdAt" DESC
          ) AS rn,
          SUM(CASE WHEN "receiverId" = ${session.userId} AND "readAt" IS NULL THEN 1 ELSE 0 END) OVER (
            PARTITION BY CASE WHEN "senderId" = ${session.userId} THEN "receiverId" ELSE "senderId" END
          ) AS unread
        FROM "Message"
        WHERE type = 'chat'
          AND ("senderId" = ${session.userId} OR "receiverId" = ${session.userId})
      )
      SELECT "otherUserId", "lastMessage", "lastTime", unread
      FROM ranked WHERE rn = 1
      ORDER BY "lastTime" DESC LIMIT 50
    ` as { otherUserId: string; lastMessage: string; lastTime: Date; unread: bigint }[];

    const userIds = rows.map((r) => r.otherUserId);
    const users = userIds.length > 0
      ? await db.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, nickname: true, avatar: true, department: true },
        })
      : [];
    const userMap = new Map(users.map((u) => [u.id, u]));

    return apiSuccess(rows.map((r) => ({
      otherUserId: r.otherUserId,
      lastMessage: r.lastMessage,
      lastTime: r.lastTime instanceof Date ? r.lastTime.toISOString() : String(r.lastTime),
      unread: Number(r.unread),
      user: userMap.get(r.otherUserId) || { id: r.otherUserId, nickname: "未知用户", avatar: null, department: null },
    })));
  } catch {
    return apiError("获取会话列表失败", 500);
  }
});
