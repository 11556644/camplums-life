import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { auditLog } from "@/lib/logger";
import { apiSuccess, apiError } from "@/lib/api-response";

// 质检 + 消毒 + 重新上架（管理员操作）
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return apiError("请先登录", 401);

  const isAdmin = await db.userRole.findFirst({ where: { userId: session.userId, role: "admin" } });
  if (!isAdmin) return apiError("仅管理员可操作", 403);

  const body = await req.json();
  const { copyId, conditionAfter, result, notes, sanitizeComplete } = body;
  // sanitizeComplete=true 表示消毒完成直接上架

  if (!copyId) return apiError("缺少副本ID");

  const copy = await db.textbookCopy.findUnique({
    where: { id: copyId },
    include: { textbook: true },
  });
  if (!copy) return apiError("教材副本不存在");

  if (sanitizeComplete) {
    // 消毒完成 → 重新上架
    if (copy.status !== "sanitizing") return apiError("该教材不在消毒状态");

    await db.$transaction(async (tx: any) => {
      await tx.textbookCopy.update({
        where: { id: copyId },
        data: { status: "available", condition: conditionAfter || copy.condition },
      });
      await tx.inventoryTransaction.create({
        data: {
          copyId,
          fromStatus: "sanitizing",
          toStatus: "available",
          operatorId: session.userId,
          detail: `消毒完成，重新上架，成色：${conditionAfter || copy.condition}`,
        },
      });
    });

    await auditLog({
      userId: session.userId,
      action: "textbook_sanitize_complete",
      targetType: "textbook",
      targetId: copyId,
      detail: `《${copy.textbook.title}》消毒完成，重新上架`,
    });

    return apiSuccess({ message: "消毒完成，已重新上架" });
  }

  // 质检记录
  if (!conditionAfter || !result) return apiError("缺少质检结果");

  // 计算赔付金额
  const FEE_MAP: Record<string, number> = {
    pass: 0,
    minor_damage: 10,
    major_damage: 30,
    retired: 50, // 按折旧价赔偿
  };
  const damageFee = FEE_MAP[result] ?? 0;

  await db.$transaction(async (tx: any) => {
    // 创建质检记录
    await tx.inspectionRecord.create({
      data: {
        copyId,
        inspectorId: session.userId,
        conditionBefore: copy.condition,
        conditionAfter,
        result,
        damageFee: damageFee > 0 ? damageFee : null,
        notes,
      },
    });

    // 更新副本成色
    await tx.textbookCopy.update({
      where: { id: copyId },
      data: { condition: conditionAfter },
    });

    // 如果报废，标记为 retired
    if (result === "retired") {
      await tx.textbookCopy.update({
        where: { id: copyId },
        data: { status: "retired" },
      });
      await tx.inventoryTransaction.create({
        data: {
          copyId,
          fromStatus: "sanitizing",
          toStatus: "retired",
          operatorId: session.userId,
          detail: `质检报废，赔付 ¥${damageFee}`,
        },
      });
    }
  });

  // 如果有赔付金额，通知借阅人
  if (damageFee > 0 && copy.borrowerId) {
    await db.message.create({
      data: {
        schoolId: copy.textbook.schoolId,
        receiverId: copy.borrowerId,
        type: "notification",
        title: "教材损坏赔付通知",
        content: `您归还的《${copy.textbook.title}》经质检发现损坏（${result}），需赔付 ¥${damageFee}，将从押金中扣除。`,
      },
    });

    // 扣除信用分
    const creditScore = await db.creditScore.findUnique({ where: { userId: copy.borrowerId } });
    if (creditScore) {
      const deduction = result === "retired" ? 10 : result === "major_damage" ? 5 : 2;
      await db.creditScore.update({
        where: { userId: copy.borrowerId },
        data: { score: Math.max(0, creditScore.score - deduction) },
      });
    }
  }

  await auditLog({
    userId: session.userId,
    action: "textbook_inspect",
    targetType: "textbook",
    targetId: copyId,
    detail: `质检《${copy.textbook.title}》：${result}，赔付 ¥${damageFee}`,
  });

  return apiSuccess({ message: "质检完成", damageFee, result });
}
