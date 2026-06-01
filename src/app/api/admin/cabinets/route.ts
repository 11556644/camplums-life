import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/api-helpers";
import { auditLog } from "@/lib/logger";
import { apiSuccess, apiError } from "@/lib/api-response";
import { adminCabinetActionSchema } from "@/lib/schemas";

// 管理员操作柜格
export async function PATCH(req: Request) {
  const session = await requireAdmin(req);

  const body = await req.json();
  const parsed = adminCabinetActionSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0].message);

  const { slotId, action, reason } = parsed.data;

  const slot = await db.cabinetSlot.findUnique({
    where: { id: slotId },
    include: { cabinet: true },
  });
  if (!slot) return apiError("柜格不存在");

  try {
    if (action === "release") {
      await db.$transaction(async (tx: any) => {
        await tx.cabinetSlot.update({ where: { id: slotId }, data: { status: "empty" } });
        await tx.cabinetSlotOrder.updateMany({
          where: { slotId, status: "active" },
          data: { status: "cancelled" },
        });
        await tx.cabinetSlotLog.create({
          data: { slotId, action: "maintenance", operatorId: session.userId, detail: `管理员强制释放：${reason || "无原因"}` },
        });
      });
      await auditLog({ userId: session.userId, action: "cabinet_force_release", targetType: "cabinet", targetId: slotId, detail: reason });
      return apiSuccess({ message: "柜格已释放" });
    }

    if (action === "fault") {
      await db.$transaction(async (tx: any) => {
        await tx.cabinetSlot.update({ where: { id: slotId }, data: { status: "fault" } });
        await tx.cabinetSlotLog.create({
          data: { slotId, action: "fault", operatorId: session.userId, detail: reason || "管理员标记故障" },
        });
      });
      await auditLog({ userId: session.userId, action: "cabinet_mark_fault", targetType: "cabinet", targetId: slotId, detail: reason });
      return apiSuccess({ message: "已标记为故障" });
    }

    if (action === "repair") {
      await db.$transaction(async (tx: any) => {
        await tx.cabinetSlot.update({ where: { id: slotId }, data: { status: "empty" } });
        await tx.cabinetSlotLog.create({
          data: { slotId, action: "maintenance", operatorId: session.userId, detail: `维修完成：${reason || ""}` },
        });
      });
      await auditLog({ userId: session.userId, action: "cabinet_repair", targetType: "cabinet", targetId: slotId, detail: reason });
      return apiSuccess({ message: "维修完成，柜格已恢复" });
    }

    if (action === "open") {
      await db.cabinetSlotLog.create({
        data: { slotId, action: "open", operatorId: session.userId, detail: `管理员远程开柜：${reason || ""}` },
      });
      await auditLog({ userId: session.userId, action: "cabinet_remote_open", targetType: "cabinet", targetId: slotId, detail: `远程开柜 ${slot.cabinet.name} #${slot.slotNumber}` });
      return apiSuccess({ message: `已发送开柜指令到 ${slot.cabinet.name} #${slot.slotNumber}` });
    }

    return apiError("无效操作");
  } catch {
    return apiError("操作失败", 500);
  }
}
