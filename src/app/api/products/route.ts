export const dynamic = "force-dynamic";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { apiSuccess, apiError } from "@/lib/api-response";
import { maskLocation } from "@/lib/privacy";

export async function GET(req: Request) {
  const session = await getSession();
  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category");
  const q = searchParams.get("q")?.trim();
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "20");

  try {
    const where: Record<string, unknown> = {
      status: "active",
      ...(category ? { category } : {}),
      ...(session?.schoolId ? { schoolId: session.schoolId } : {}),
    };
    if (q) {
      where.OR = [
        { title: { contains: q } },
        { description: { contains: q } },
      ];
    }

    const [products, total] = await Promise.all([
      db.product.findMany({
        where,
        include: {
          seller: { select: { id: true, nickname: true, dormitory: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.product.count({ where }),
    ]);

    // 脱敏：列表只展示楼栋，不暴露房间号
    const masked = products.map((p: any) => ({
      ...p,
      location: maskLocation(p.location),
      seller: { ...p.seller, dormitory: maskLocation(p.seller.dormitory) },
    }));

    return apiSuccess({ products: masked, total, page, limit });
  } catch (error) {
    return apiError("获取商品列表失败", 500);
  }
}
