export const dynamic = "force-dynamic";
import { withAuth } from "@/lib/api-helpers";
import { db } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api-response";

export const GET = withAuth(async (_req, session) => {
  try {
    const favorites = await db.productFavorite.findMany({
      where: { userId: session.userId },
      include: {
        product: {
          select: {
            id: true, title: true, price: true, images: true,
            status: true, category: true, location: true,
            seller: { select: { id: true, nickname: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const items = favorites.map((f) => ({
      id: f.product.id,
      title: f.product.title,
      price: f.product.price,
      images: f.product.images ? JSON.parse(f.product.images) : [],
      status: f.product.status,
      category: f.product.category,
      location: f.product.location,
      seller: f.product.seller,
      favoritedAt: f.createdAt,
      isExpired: f.product.status !== "active",
    }));

    return apiSuccess(items);
  } catch {
    return apiError("获取收藏列表失败", 500);
  }
});
