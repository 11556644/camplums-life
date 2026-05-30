import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

function getSecret(): Uint8Array {
  const key = process.env.JWT_SECRET;
  if (!key && process.env.NODE_ENV === "production") {
    throw new Error("FATAL: JWT_SECRET environment variable is required in production");
  }
  if (!key) {
    console.warn("[dev] JWT_SECRET not set, using dev fallback");
  }
  return new TextEncoder().encode(key || "campus-life-dev-secret-not-for-production");
}

const SECRET = getSecret();

const COOKIE_NAME = "auth_token";

export interface JwtPayload {
  userId: string;
  phone: string;
  roles: string[];
  schoolId?: string; // 旧 token 可能没有此字段
}

// 简易状态缓存：避免每次 API 请求都查数据库
const statusCache = new Map<string, { status: string; expireAt: number }>();
const CACHE_TTL = 30_000; // 30 秒

export async function signToken(payload: JwtPayload): Promise<string> {
  return new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("2h")
    .sign(SECRET);
}

export async function verifyToken(token: string): Promise<JwtPayload | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return payload as unknown as JwtPayload;
  } catch {
    return null;
  }
}

export async function getSession(): Promise<JwtPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const payload = await verifyToken(token);
  if (!payload) return null;

  // 实时检查用户状态（封禁即时生效），但带缓存避免每次查库
  // 同时补全旧 token 中缺失的 schoolId
  try {
    const cached = statusCache.get(payload.userId);
    const now = Date.now();
    if (cached && now < cached.expireAt) {
      if (cached.status !== "active") return null;
      // cache 命中但 schoolId 缺失，从 DB 补全
      if (!payload.schoolId) {
        const user = await db.user.findUnique({
          where: { id: payload.userId },
          select: { schoolId: true },
        });
        if (user) payload.schoolId = user.schoolId;
      }
    } else {
      const user = await db.user.findUnique({
        where: { id: payload.userId },
        select: { status: true, schoolId: true },
      });
      if (!user) return null;
      statusCache.set(payload.userId, { status: user.status, expireAt: now + CACHE_TTL });
      if (user.status !== "active") return null;
      if (!payload.schoolId) payload.schoolId = user.schoolId;
    }
  } catch {
    // 数据库异常时降级放行，避免完全不可用
  }

  return payload;
}

export function createAuthResponse(token: string, body: unknown) {
  const response = NextResponse.json(body);
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 2, // 2 小时
    path: "/",
  });
  return response;
}

export function createLogoutResponse(body: unknown) {
  const response = NextResponse.json(body);
  response.cookies.delete(COOKIE_NAME);
  return response;
}
