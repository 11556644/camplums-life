export const dynamic = "force-dynamic";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/api-helpers";
import { auditLog } from "@/lib/logger";
import { apiSuccess, apiError } from "@/lib/api-response";
import { z } from "zod";

const updateSchema = z.object({
  nickname: z.string().min(1).max(20).optional(),
  department: z.string().max(50).optional(),
  dormitory: z.string().max(30).optional(),
  roomNumber: z.string().max(10).optional(),
}).strict();

export const GET = withAuth(async (req, session) => {
  const user = await db.user.findUnique({
    where: { id: session.userId },
    include: {
      roles: true,
      creditScore: true,
      wallet: true,
      products: { where: { status: "active" }, orderBy: { createdAt: "desc" }, take: 10 },
      tasks: { where: { status: "open" }, orderBy: { createdAt: "desc" }, take: 10 },
      buyerOrders: { orderBy: { createdAt: "desc" }, take: 10 },
      sellerOrders: { orderBy: { createdAt: "desc" }, take: 10 },
    },
  });
  if (!user) return apiError("用户不存在", 404);

  const { passwordHash, ...safe } = user;
  return apiSuccess(safe);
});

export const PATCH = withAuth(async (req, session) => {
  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0].message);

  const updated = await db.user.update({
    where: { id: session.userId },
    data: parsed.data,
  });
  const { passwordHash, ...safe } = updated;

  await auditLog({
    userId: session.userId,
    action: "profile_update",
    targetType: "user",
    targetId: session.userId,
    detail: `更新字段：${Object.keys(parsed.data).join(", ")}`,
  });

  return apiSuccess(safe);
});
