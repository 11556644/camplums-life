export const dynamic = "force-dynamic";
import { db } from "@/lib/db";
import { withAdmin } from "@/lib/api-helpers";
import { apiSuccess } from "@/lib/api-response";
import type { JwtPayload } from "@/lib/auth";

export const GET = withAdmin(async (req: Request, session: JwtPayload) => {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "20");

  const where: Record<string, unknown> = { schoolId: session.schoolId };
  if (status && status !== "all") where.status = status;

  const [orders, total] = await Promise.all([
    db.order.findMany({
      where,
      include: {
        buyer: { select: { id: true, nickname: true } },
        seller: { select: { id: true, nickname: true } },
        items: { include: { product: { select: { title: true } }, task: { select: { title: true } } } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    db.order.count({ where }),
  ]);

  return apiSuccess({ orders, total, page, limit });
});
