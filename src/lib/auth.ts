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
}

export async function signToken(payload: JwtPayload): Promise<string> {
  return new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("2h") // 缩短到 2 小时，配合 refresh
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

  // 实时检查用户状态（封禁即时生效）
  try {
    const user = await db.user.findUnique({
      where: { id: payload.userId },
      select: { status: true },
    });
    if (!user || user.status !== "active") return null;
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
