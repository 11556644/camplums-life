export const dynamic = "force-dynamic";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/api-helpers";
import { apiSuccess, apiError } from "@/lib/api-response";

export const GET = withAuth(async (req, session) => {
  const messages = await db.message.findMany({
    where: { receiverId: session.userId, schoolId: session.schoolId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return apiSuccess(messages);
});
