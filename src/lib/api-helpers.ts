import { getSession, type JwtPayload } from "@/lib/auth";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api-response";

type Handler = (req: Request, session: JwtPayload) => Promise<Response>;

/** 仅认证，返回 session 或抛出 401 Response */
export async function requireAuth(_req: Request): Promise<JwtPayload> {
  const session = await getSession();
  if (!session) throw apiError("请先登录", 401);
  return session;
}

/** 认证 + 管理员权限检查 */
export async function requireAdmin(_req: Request): Promise<JwtPayload> {
  const session = await requireAuth(_req);
  const isAdmin = await db.userRole.findFirst({
    where: { userId: session.userId, role: "admin" },
  });
  if (!isAdmin) throw apiError("无权限", 403);
  return session;
}

/** 包裹 handler：自动鉴权 + 统一错误处理 */
export function withAuth(handler: Handler): (req: Request) => Promise<Response> {
  return async (req: Request) => {
    try {
      const session = await requireAuth(req);
      return await handler(req, session);
    } catch (error) {
      if (error instanceof Response) return error;
      console.error("[API Error]", error);
      return apiError("服务器内部错误", 500);
    }
  };
}

/** 包裹 handler：自动鉴权 + admin 检查 + 统一错误处理 */
export function withAdmin(handler: Handler): (req: Request) => Promise<Response> {
  return async (req: Request) => {
    try {
      const session = await requireAdmin(req);
      return await handler(req, session);
    } catch (error) {
      if (error instanceof Response) return error;
      console.error("[API Error]", error);
      return apiError("服务器内部错误", 500);
    }
  };
}
