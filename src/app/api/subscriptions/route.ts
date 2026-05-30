export const dynamic = "force-dynamic";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { apiSuccess, apiError } from "@/lib/api-response";

// 获取订阅套餐
export async function GET() {
  const session = await getSession();
  try {
    const plans = await db.subscriptionPlan.findMany({
      where: {
        status: "active",
        ...(session?.schoolId ? { schoolId: session.schoolId } : {}),
      },
      orderBy: { price: "asc" },
    });
    return apiSuccess(plans);
  } catch {
    return apiError("获取套餐列表失败", 500);
  }
}
