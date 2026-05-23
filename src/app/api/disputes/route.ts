import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { auditLog, domainEvent } from "@/lib/logger";
import { apiSuccess, apiError } from "@/lib/api-response";

// 获取投诉列表（本人的或全部）
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return apiError("请先登录", 401);

  const { searchParams } = new URL(req.url);
  const scope = searchParams.get("scope") || "mine"; // mine | all

  const isAdmin = await db.userRole.findFirst({ where: { userId: session.userId, role: "admin" } });

  try {
    const where = scope === "all" && isAdmin
      ? {}
      : { initiatorId: session.userId };

    const disputes = await db.dispute.findMany({
      where,
      include: {
        order: { select: { orderNo: true, totalAmount: true, status: true } },
        initiator: { select: { id: true, nickname: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return apiSuccess(disputes);
  } catch {
    return apiError("获取投诉列表失败", 500);
  }
}

// 创建投诉
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return apiError("请先登录", 401);

  const body = await req.json();
  const { orderId, reason, description, evidence } = body;

  if (!orderId || !reason?.trim() || !description?.trim()) {
    return apiError("缺少必要参数");
  }

  const order = await db.order.findUnique({ where: { id: orderId } });
  if (!order) return apiError("订单不存在", 404);

  // 只有买卖双方可以投诉
  if (order.buyerId !== session.userId && order.sellerId !== session.userId) {
    return apiError("无权投诉此订单", 403);
  }

  // 检查是否已有投诉
  const existing = await db.dispute.findFirst({ where: { orderId, initiatorId: session.userId } });
  if (existing) return apiError("您已对此订单发起过投诉");

  try {
    const dispute = await db.dispute.create({
      data: {
        orderId,
        schoolId: order.schoolId,
        initiatorId: session.userId,
        reason: reason.trim(),
        description: description.trim(),
        evidence: evidence ? JSON.stringify(evidence) : null,
        status: "pending",
      },
    });

    // 通知管理员
    const admins = await db.userRole.findMany({ where: { role: "admin" } });
    for (const admin of admins) {
      await db.message.create({
        data: {
          schoolId: order.schoolId,
          senderId: session.userId,
          receiverId: admin.userId,
          type: "notification",
          title: "新投诉待处理",
          content: `订单 ${order.orderNo} 收到投诉：${reason.trim()}`,
        },
      });
    }

    await auditLog({
      userId: session.userId,
      action: "dispute_create",
      targetType: "order",
      targetId: orderId,
      detail: `投诉原因：${reason.trim()}`,
    });

    return apiSuccess(dispute);
  } catch {
    return apiError("创建投诉失败", 500);
  }
}
