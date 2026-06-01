export const dynamic = "force-dynamic";
import { db } from "@/lib/db";
import { withAdmin } from "@/lib/api-helpers";
import { apiSuccess, apiError } from "@/lib/api-response";
import { textbookAdminActionSchema } from "@/lib/schemas";

// 获取待消毒/待质检的教材副本
export const GET = withAdmin(async (_req, _session) => {
  const copies = await db.textbookCopy.findMany({
    where: { status: { in: ["sanitizing", "borrowed"] } },
    include: {
      textbook: { select: { id: true, title: true, author: true, isbn: true } },
      inspectionRecords: { orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: { updatedAt: "desc" },
  });

  return apiSuccess(copies);
});

// PATCH: 管理员处理消毒/质检
export const PATCH = withAdmin(async (req, session) => {
  const body = await req.json();
  const parsed = textbookAdminActionSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0].message);

  const { copyId, action, condition, notes } = parsed.data;

  const copy = await db.textbookCopy.findUnique({ where: { id: copyId } });
  if (!copy) return apiError("副本不存在");

  if (action === "sanitize") {
    await db.textbookCopy.update({
      where: { id: copyId },
      data: { status: "sanitizing" },
    });
    await db.inspectionRecord.create({
      data: {
        copyId,
        inspectorId: session.userId,
        conditionAfter: copy.condition || "good",
        result: "pending",
        notes: notes || "开始消毒",
      },
    });
    return apiSuccess({ message: "已标记为消毒中" });
  }

  if (action === "inspect") {
    const newCondition = condition || copy.condition;
    const newStatus = condition ? "available" : "damaged";
    await db.textbookCopy.update({
      where: { id: copyId },
      data: { status: newStatus, condition: newCondition },
    });
    await db.inspectionRecord.create({
      data: {
        copyId,
        inspectorId: session.userId,
        conditionBefore: copy.condition,
        conditionAfter: newCondition,
        result: condition ? "pass" : "major_damage",
        notes: notes || (condition ? `质检通过，成色：${condition}` : "质检不通过"),
      },
    });
    return apiSuccess({ message: "质检完成" });
  }

  return apiError("无效的操作");
});
