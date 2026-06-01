import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/api-helpers";
import { auditLog } from "@/lib/logger";
import { apiSuccess, apiError } from "@/lib/api-response";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin(req);

  const { id } = await params;
  const body = await req.json();
  const { action } = body; // approve, remove

  const statusMap: Record<string, string> = {
    approve: "active",
    remove: "removed",
  };

  const newStatus = statusMap[action];
  if (!newStatus) return apiError("无效操作");

  const product = await db.product.findUnique({ where: { id } });
  if (!product) return apiError("商品不存在", 404);

  const updated = await db.product.update({
    where: { id },
    data: { status: newStatus },
  });

  await auditLog({
    userId: session.userId,
    action: `admin_product_${action}`,
    targetType: "product",
    targetId: id,
    detail: `商品「${product.title}」${action === "approve" ? "审核通过" : "已下架"}`,
  });

  // 通知卖家
  if (action === "remove") {
    await db.message.create({
      data: {
        schoolId: product.schoolId,
        receiverId: product.sellerId,
        type: "notification",
        title: "商品已被下架",
        content: `您的商品「${product.title}」已被管理员下架，如有疑问请联系管理员。`,
      },
    });
  }

  return apiSuccess(updated);
}
