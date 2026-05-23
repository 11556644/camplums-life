import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api-response";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return apiError("未登录", 401);
  }

  const user = await db.user.findUnique({
    where: { id: session.userId },
    include: {
      roles: true,
      creditScore: true,
      school: { select: { id: true, name: true } },
    },
  });

  if (!user) {
    return apiError("用户不存在", 404);
  }

  return apiSuccess({
    id: user.id,
    nickname: user.nickname,
    phone: user.phone,
    studentId: user.studentId,
    department: user.department,
    dormitory: user.dormitory,
    roomNumber: user.roomNumber,
    enrollYear: user.enrollYear,
    avatar: user.avatar,
    status: user.status,
    roles: user.roles.map((r: { role: string }) => r.role),
    creditScore: user.creditScore?.score ?? 100,
    school: user.school,
    createdAt: user.createdAt,
  });
}
