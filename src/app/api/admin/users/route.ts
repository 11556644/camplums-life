import { db } from "@/lib/db";
import { withAdmin } from "@/lib/api-helpers";
import { apiSuccess, apiError } from "@/lib/api-response";
import { adminUpdateUserSchema } from "@/lib/schemas";
import type { JwtPayload } from "@/lib/auth";

// 获取用户列表
export const GET = withAdmin(async (req: Request, session: JwtPayload) => {
  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "20");

  const [users, total] = await Promise.all([
    db.user.findMany({
      where: { schoolId: session.schoolId },
      select: {
        id: true, phone: true, nickname: true, studentId: true, department: true,
        dormitory: true, status: true, createdAt: true,
        roles: true, creditScore: true,
        _count: { select: { buyerOrders: true, sellerOrders: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    db.user.count({ where: { schoolId: session.schoolId } }),
  ]);

  return apiSuccess({ users, total, page, limit });
});

// 封禁/解封用户
export const PATCH = withAdmin(async (req: Request, session: JwtPayload) => {
  const body = await req.json();
  const parsed = adminUpdateUserSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0].message);

  const { userId, status } = parsed.data;

  const admin = await db.user.findUnique({ where: { id: session.userId }, select: { schoolId: true } });

  await db.user.update({
    where: { id: userId },
    data: { status },
  });

  // 审计日志
  await db.auditLog.create({
    data: {
      userId: session.userId,
      schoolId: admin?.schoolId || session.schoolId || "",
      action: `admin_user_${status}`,
      targetType: "user",
      targetId: userId,
      detail: `管理员将用户状态改为 ${status}`,
    },
  });

  // 通知被操作用户
  await db.message.create({
    data: {
      schoolId: admin?.schoolId || session.schoolId || "",
      receiverId: userId,
      type: "notification",
      title: status === "banned" ? "账号已被封禁" : status === "active" ? "账号已解封" : "账号状态变更",
      content: status === "banned" ? "您的账号已被管理员封禁，如有疑问请联系管理员。" : status === "active" ? "您的账号已解封，可以正常使用。" : `您的账号状态已变更为：${status}`,
    },
  });

  return apiSuccess(null, `用户状态已更新为 ${status}`);
});
