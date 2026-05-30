import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { auditLog } from "@/lib/logger";
import { apiSuccess, apiError } from "@/lib/api-response";
import { getCreditPermissions } from "@/lib/credit";
import { z } from "zod";

const schema = z.object({
  title: z.string().min(1).max(100),
  description: z.string().min(1),
  type: z.string().min(1),
  budget: z.number().nullable().optional(),
  budgetType: z.string().default("fixed"),
  location: z.string().optional(),
  deadline: z.coerce.date().optional(),
});

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return apiError("请先登录", 401);

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0].message);

  const user = await db.user.findUnique({ where: { id: session.userId } });
  if (!user) return apiError("用户不存在");

  // 信用分门禁：通过信用体系统一校验
  const perms = await getCreditPermissions(session.userId);
  if (!perms.canPublish) return apiError("信用分不足，无法发布任务");

  const task = await db.task.create({
    data: {
      schoolId: user.schoolId,
      publisherId: session.userId,
      title: parsed.data.title,
      description: parsed.data.description,
      type: parsed.data.type,
      budget: parsed.data.budget ?? null,
      budgetType: parsed.data.budgetType,
      location: parsed.data.location,
      deadline: parsed.data.deadline ?? null,
    },
  });

  await auditLog({
    userId: session.userId,
    action: "task_publish",
    targetType: "task",
    targetId: task.id,
    detail: `Published: ${task.title}`,
  });

  return apiSuccess(task);
}
