import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { auditLog } from "@/lib/logger";
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

// 卖家下架/重新上架商品
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return apiError("请先登录", 401);

  const { id } = await params;
  const body = await req.json();
  const { action } = body; // "delist" | "relist"

  const product = await db.product.findUnique({ where: { id }, select: { id: true, sellerId: true, status: true, title: true } });
  if (!product) return apiError("商品不存在", 404);
  if (product.sellerId !== session.userId) return apiError("只能操作自己的商品", 403);

  if (action === "delist") {
    if (product.status !== "active") return apiError("只有上架中的商品可以下架");
    await db.product.update({ where: { id }, data: { status: "delisted" } });
    await auditLog({ userId: session.userId, action: "product_delist", targetType: "product", targetId: id, detail: `下架：${product.title}` });
    return apiSuccess({ message: "已下架" });
  }

  if (action === "relist") {
    if (product.status !== "delisted") return apiError("只有已下架的商品可以重新上架");
    await db.product.update({ where: { id }, data: { status: "active" } });
    await auditLog({ userId: session.userId, action: "product_relist", targetType: "product", targetId: id, detail: `重新上架：${product.title}` });
    return apiSuccess({ message: "已重新上架" });
  }

  return apiError("无效操作");
}
