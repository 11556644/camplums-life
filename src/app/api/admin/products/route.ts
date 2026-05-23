export const dynamic = "force-dynamic";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { apiSuccess, apiError } from "@/lib/api-response";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return apiError("请先登录", 401);

  const isAdmin = await db.userRole.findFirst({ where: { userId: session.userId, role: "admin" } });
  if (!isAdmin) return apiError("无权限", 403);

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") || "active";

  const where: Record<string, unknown> = {};
  if (status !== "all") where.status = status;

  const products = await db.product.findMany({
    where,
    include: {
      seller: { select: { id: true, nickname: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return apiSuccess(products);
}
