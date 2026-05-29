import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { apiSuccess, apiError } from "@/lib/api-response";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return apiError("请先登录", 401);

  const { id } = await params;

  try {
    const product = await db.product.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!product) return apiError("商品不存在", 404);

    const existing = await db.productFavorite.findUnique({
      where: { userId_productId: { userId: session.userId, productId: id } },
    });

    if (existing) {
      await db.productFavorite.delete({ where: { id: existing.id } });
      return apiSuccess({ favorited: false });
    }

    await db.productFavorite.create({
      data: { userId: session.userId, productId: id },
    });
    return apiSuccess({ favorited: true });
  } catch {
    return apiError("操作失败", 500);
  }
}
