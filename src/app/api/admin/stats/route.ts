import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { apiSuccess, apiError } from "@/lib/api-response";

export async function GET() {
  const session = await getSession();
  if (!session) return apiError("请先登录", 401);

  const isAdmin = await db.userRole.findFirst({
    where: { userId: session.userId, role: "admin" },
  });
  if (!isAdmin) return apiError("无权限", 403);

  try {
    const [userCount, productCount, orderCount, taskCount, cabinetCount, textbookCount, totalRevenue, recentOrders, recentAuditLogs] = await Promise.all([
      db.user.count(),
      db.product.count({ where: { status: "active" } }),
      db.order.count(),
      db.task.count({ where: { status: "open" } }),
      db.cabinet.count(),
      db.textbook.count(),
      db.payment.aggregate({ where: { status: "success" }, _sum: { amount: true } }),
      db.order.findMany({
        take: 10,
        orderBy: { createdAt: "desc" },
        include: {
          buyer: { select: { nickname: true } },
          seller: { select: { nickname: true } },
        },
      }),
      db.auditLog.findMany({
        take: 20,
        orderBy: { createdAt: "desc" },
        include: { user: { select: { nickname: true } } },
      }),
    ]);

    return apiSuccess({
      stats: {
        userCount,
        productCount,
        orderCount,
        taskCount,
        cabinetCount,
        textbookCount,
        totalRevenue: totalRevenue._sum.amount || 0,
      },
      recentOrders,
      recentAuditLogs,
    });
  } catch {
    return apiError("获取数据失败", 500);
  }
}
