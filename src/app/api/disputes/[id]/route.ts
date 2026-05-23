import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { auditLog, domainEvent } from "@/lib/logger";
import { apiSuccess, apiError } from "@/lib/api-response";

// 获取投诉详情
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return apiError("请先登录", 401);

  const { id } = await params;

  const dispute = await db.dispute.findUnique({
    where: { id },
    include: {
      order: {
        include: {
          buyer: { select: { id: true, nickname: true } },
          seller: { select: { id: true, nickname: true } },
          items: { include: { product: { select: { title: true } } } },
        },
      },
      initiator: { select: { id: true, nickname: true } },
    },
  });

  if (!dispute) return apiError("投诉不存在", 404);

  // 权限：买卖双方或管理员可查看
  const isAdmin = await db.userRole.findFirst({ where: { userId: session.userId, role: "admin" } });
  const isInvolved = dispute.order.buyerId === session.userId || dispute.order.sellerId === session.userId;
  if (!isAdmin && !isInvolved) return apiError("无权查看", 403);

  return apiSuccess(dispute);
}

// 处理投诉（管理员仲裁）
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return apiError("请先登录", 401);

  const isAdmin = await db.userRole.findFirst({ where: { userId: session.userId, role: "admin" } });
  if (!isAdmin) return apiError("仅管理员可处理投诉", 403);

  const { id } = await params;
  const body = await req.json();
  const { action, resolution } = body; // action: review, resolve, reject

  const dispute = await db.dispute.findUnique({ where: { id }, include: { order: true } });
  if (!dispute) return apiError("投诉不存在", 404);

  const statusMap: Record<string, string> = {
    review: "reviewing",
    resolve: "resolved",
    reject: "rejected",
  };

  const newStatus = statusMap[action];
  if (!newStatus) return apiError("无效操作");

  try {
    const updated = await db.$transaction(async (tx: any) => {
      const d = await tx.dispute.update({
        where: { id },
        data: {
          status: newStatus,
          resolution: resolution || null,
          resolvedBy: action !== "review" ? session.userId : undefined,
          resolvedAt: action !== "review" ? new Date() : undefined,
        },
      });

      // 解决投诉时更新订单状态
      if (action === "resolve") {
        await tx.order.update({
          where: { id: dispute.orderId },
          data: { status: "disputed" },
        });

        // 通知双方
        const otherParty = dispute.initiatorId === dispute.order.buyerId ? dispute.order.sellerId : dispute.order.buyerId;
        for (const uid of [dispute.initiatorId, otherParty]) {
          await tx.message.create({
            data: {
              schoolId: dispute.schoolId,
              receiverId: uid,
              type: "notification",
              title: "投诉已处理",
              content: `订单 ${dispute.order.orderNo} 的投诉已处理：${resolution || "已解决"}`,
            },
          });
        }

        // 败诉方（非发起人）扣信用分
        const cs = await tx.creditScore.findUnique({ where: { userId: otherParty } });
        if (cs) await tx.creditScore.update({ where: { userId: otherParty }, data: { score: Math.max(0, cs.score - 5) } });
      }

      if (action === "reject") {
        // 通知发起人
        await tx.message.create({
          data: {
            schoolId: dispute.schoolId,
            receiverId: dispute.initiatorId,
            type: "notification",
            title: "投诉已驳回",
            content: `您对订单 ${dispute.order.orderNo} 的投诉已被驳回：${resolution || "证据不足"}`,
          },
        });
        // 恶意投诉扣信用分
        const cs = await tx.creditScore.findUnique({ where: { userId: dispute.initiatorId } });
        if (cs) await tx.creditScore.update({ where: { userId: dispute.initiatorId }, data: { score: Math.max(0, cs.score - 3) } });
      }

      return d;
    });

    await auditLog({
      userId: session.userId,
      action: `dispute_${action}`,
      targetType: "dispute",
      targetId: id,
      detail: resolution,
    });

    return apiSuccess(updated);
  } catch {
    return apiError("处理投诉失败", 500);
  }
}
