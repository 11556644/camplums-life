import { createLogoutResponse } from "@/lib/auth";

export async function POST() {
  return createLogoutResponse({ success: true, message: "已退出登录" });
}
