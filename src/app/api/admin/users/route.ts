import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { apiSuccess, apiError } from "@/lib/api-response";

// 获取用户列表
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return apiError("请先登录", 401);

  const isAdmin = await db.userRole.findFirst({
    where: { userId: session.userId, role: "admin" },
  });
  if (!isAdmin) return apiError("无权限", 403);

  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "20");

  try {
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
  } catch {
    return apiError("获取用户列表失败", 500);
  }
}

// 封禁/解封用户
export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) return apiError("请先登录", 401);

  const isAdmin = await db.userRole.findFirst({
    where: { userId: session.userId, role: "admin" },
  });
  if (!isAdmin) return apiError("无权限", 403);

  const body = await req.json();
  const { userId, status } = body;

  if (!userId || !["active", "banned", "suspended"].includes(status)) {
    return apiError("参数无效");
  }

  try {
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
  } catch {
    return apiError("操作失败", 500);
  }
}
