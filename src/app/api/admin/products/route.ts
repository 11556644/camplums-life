export const dynamic = "force-dynamic";
import { db } from "@/lib/db";
import { withAdmin } from "@/lib/api-helpers";
import { apiSuccess } from "@/lib/api-response";
import type { JwtPayload } from "@/lib/auth";

export const GET = withAdmin(async (req: Request, session: JwtPayload) => {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") || "active";

  const where: Record<string, unknown> = { schoolId: session.schoolId };
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
});
