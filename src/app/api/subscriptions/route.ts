export const dynamic = "force-dynamic";
import { db } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api-response";

// 获取订阅套餐
export async function GET() {
  try {
    const plans = await db.subscriptionPlan.findMany({
      where: { status: "active" },
      orderBy: { price: "asc" },
    });
    return apiSuccess(plans);
  } catch {
    return apiError("获取套餐列表失败", 500);
  }
}
