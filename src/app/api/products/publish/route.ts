export const dynamic = "force-dynamic";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getCreditPermissions } from "@/lib/credit";
import { auditLog } from "@/lib/logger";
import { apiSuccess, apiError } from "@/lib/api-response";
import { z } from "zod";

const schema = z.object({
  title: z.string().min(1).max(100),
  description: z.string().min(1),
  price: z.number().min(0),
  category: z.string().min(1),
  location: z.string().optional(),
  images: z.array(z.string()).optional(),
});

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return apiError("请先登录", 401);

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0].message);

  const user = await db.user.findUnique({ where: { id: session.userId } });
  if (!user) return apiError("用户不存在");

  // 信用分门禁
  const perms = await getCreditPermissions(session.userId);
  if (!perms.canPublish) return apiError("信用分不足，无法发布商品");

  // 确保有卖家角色
  const hasSellerRole = await db.userRole.findFirst({
    where: { userId: session.userId, role: "seller" },
  });
  if (!hasSellerRole) {
    await db.userRole.create({ data: { userId: session.userId, schoolId: user.schoolId, role: "seller" } });
  }

  const { images, ...rest } = parsed.data;
  const product = await db.product.create({
    data: {
      schoolId: user.schoolId,
      sellerId: session.userId,
      ...rest,
      images: images ? JSON.stringify(images) : null,
    },
  });

  await auditLog({
    userId: session.userId,
    action: "product_publish",
    targetType: "product",
    targetId: product.id,
    detail: `Published: ${product.title}`,
  });

  return apiSuccess(product);
}
