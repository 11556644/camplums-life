import { db } from "@/lib/db";
import { signToken, createAuthResponse } from "@/lib/auth";
import { auditLog } from "@/lib/logger";
import { apiError } from "@/lib/api-response";
import bcrypt from "bcryptjs";
import { z } from "zod";

const loginSchema = z.object({
  phone: z.string().min(1, "请输入手机号"),
  password: z.string().min(1, "请输入密码"),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(parsed.error.issues[0].message);
    }

    const { phone, password } = parsed.data;

    const user = await db.user.findUnique({
      where: { phone },
      include: { roles: true },
    });

    if (!user) return apiError("手机号或密码错误");
    if (user.status !== "active") return apiError("账号已被禁用，请联系管理员");

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return apiError("手机号或密码错误");

    const token = await signToken({
      userId: user.id,
      phone: user.phone,
      roles: user.roles.map((r: { role: string }) => r.role),
      schoolId: user.schoolId,
    });

    await auditLog({
      userId: user.id,
      action: "login",
      targetType: "user",
      targetId: user.id,
      detail: `User logged in: ${phone}`,
    });

    return createAuthResponse(token, {
      success: true,
      data: {
        id: user.id,
        nickname: user.nickname,
        phone: user.phone,
        roles: user.roles.map((r: { role: string }) => r.role),
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    return apiError("登录失败，请稍后重试", 500);
  }
}
