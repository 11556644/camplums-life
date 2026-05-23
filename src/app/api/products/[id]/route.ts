import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { apiSuccess, apiError } from "@/lib/api-response";
import { maskLocation } from "@/lib/privacy";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getSession();

  try {
    const product = await db.product.findUnique({
      where: { id },
      include: {
        seller: {
          select: { id: true, nickname: true, dormitory: true, department: true, createdAt: true },
        },
      },
    });

    if (!product) return apiError("商品不存在", 404);

    // 隐私脱敏：非卖家本人只能看到楼栋
    const isSeller = session?.userId === product.sellerId;
    const maskedProduct = {
      ...product,
      location: maskLocation(product.location),
      seller: {
        ...product.seller,
        dormitory: isSeller ? product.seller.dormitory : maskLocation(product.seller.dormitory),
      },
    };

    return apiSuccess(maskedProduct);
  } catch {
    return apiError("获取商品详情失败", 500);
  }
}
