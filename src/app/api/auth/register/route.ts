import { db } from "@/lib/db";
import { signToken, createAuthResponse } from "@/lib/auth";
import { auditLog } from "@/lib/logger";
import { apiError } from "@/lib/api-response";
import bcrypt from "bcryptjs";
import { z } from "zod";

const registerSchema = z.object({
  phone: z.string().regex(/^1[3-9]\d{9}$/, "手机号格式不正确"),
  password: z.string().min(6, "密码至少6位"),
  nickname: z.string().min(1, "昵称不能为空").max(20),
  schoolId: z.string().min(1),
  studentId: z.string().optional(),
  department: z.string().optional(),
  dormitory: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) return apiError(parsed.error.issues[0].message);

    const { phone, password, nickname, schoolId, studentId, department, dormitory } = parsed.data;

    const existing = await db.user.findUnique({ where: { phone } });
    if (existing) return apiError("该手机号已注册");

    const school = await db.school.findUnique({ where: { id: schoolId } });
    if (!school) return apiError("学校不存在");

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await db.user.create({
      data: {
        schoolId, phone, passwordHash, nickname, studentId, department, dormitory,
        roles: { create: { role: "buyer", schoolId } },
        creditScore: { create: { score: 100, schoolId } },
      },
      include: { roles: true },
    });

    const token = await signToken({
      userId: user.id,
      phone: user.phone,
      roles: user.roles.map((r: { role: string }) => r.role),
    });

    await auditLog({
      userId: user.id,
      action: "register",
      targetType: "user",
      targetId: user.id,
      detail: `User registered: ${phone}`,
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
    console.error("Register error:", error);
    return apiError("注册失败，请稍后重试", 500);
  }
}
