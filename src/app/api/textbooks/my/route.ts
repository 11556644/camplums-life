export const dynamic = "force-dynamic";
import { withAuth } from "@/lib/api-helpers";
import { db } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api-response";

export const GET = withAuth(async (_req, session) => {
  try {
    // 当前借阅中
    const borrowing = await db.textbookCopy.findMany({
      where: { borrowerId: session.userId, status: "borrowed" },
      include: { textbook: true },
      orderBy: { dueDate: "asc" },
    });

    // 历史借阅（已归还/消毒中）
    const history = await db.textbookCopy.findMany({
      where: {
        status: { in: ["available", "sanitizing", "retired"] },
        inventoryTransactions: {
          some: { operatorId: session.userId, toStatus: "borrowed" },
        },
      },
      include: { textbook: true },
      orderBy: { updatedAt: "desc" },
      take: 20,
    });

    // 计算逾期信息
    const now = new Date();
    const enriched = borrowing.map((c: any) => {
      const isOverdue = c.dueDate ? now > c.dueDate : false;
      const overdueDays = isOverdue && c.dueDate
        ? Math.ceil((now.getTime() - c.dueDate.getTime()) / (1000 * 60 * 60 * 24))
        : 0;
      const remainingDays = c.dueDate
        ? Math.ceil((c.dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        : 0;
      return {
        ...c,
        isOverdue,
        overdueDays,
        remainingDays: Math.max(0, remainingDays),
      };
    });

    return apiSuccess({ borrowing: enriched, history });
  } catch {
    return apiError("获取教材信息失败", 500);
  }
});
