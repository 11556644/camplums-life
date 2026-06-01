import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

// 简易内存限流（生产环境应用 Redis）
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

function getRateLimit(key: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  if (!entry || now > entry.resetTime) {
    rateLimitMap.set(key, { count: 1, resetTime: now + windowMs });
    return true;
  }

  if (entry.count >= maxRequests) return false;
  entry.count++;
  return true;
}

// 需要登录的页面路径
const AUTH_PAGES = [
  "/profile",
  "/orders",
  "/wallet",
  "/messages",
  "/chats",
  "/disputes",
  "/subscriptions",
];

// JWT 验证（Edge Runtime 兼容）
async function verifyToken(token: string): Promise<boolean> {
  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) return process.env.NODE_ENV !== "production";
    await jwtVerify(token, new TextEncoder().encode(secret));
    return true;
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ==================== API 限流 ====================
  if (pathname.startsWith("/api/")) {
    const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown";

    if (pathname.startsWith("/api/auth/")) {
      if (!getRateLimit(`auth:${ip}`, 5, 60_000)) {
        return NextResponse.json({ error: "请求过于频繁，请稍后再试" }, { status: 429 });
      }
    }

    if (pathname.startsWith("/api/wallet") || pathname.includes("/rate")) {
      if (!getRateLimit(`pay:${ip}`, 10, 60_000)) {
        return NextResponse.json({ error: "请求过于频繁，请稍后再试" }, { status: 429 });
      }
    }

    if (pathname.includes("/publish")) {
      if (!getRateLimit(`publish:${ip}`, 20, 60_000)) {
        return NextResponse.json({ error: "请求过于频繁，请稍后再试" }, { status: 429 });
      }
    }

    if (!getRateLimit(`api:${ip}`, 100, 60_000)) {
      return NextResponse.json({ error: "请求过于频繁，请稍后再试" }, { status: 429 });
    }

    return NextResponse.next();
  }

  // ==================== 页面路由保护（JWT 真实验证）====================
  const isProtectedPage =
    AUTH_PAGES.some(p => pathname.startsWith(p)) || pathname.startsWith("/admin");

  if (isProtectedPage) {
    const token = request.cookies.get("auth_token")?.value;
    if (!token || !(await verifyToken(token))) {
      const response = NextResponse.redirect(new URL("/login", request.url));
      response.cookies.delete("auth_token");
      return response;
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*", "/profile/:path*", "/orders/:path*", "/wallet/:path*", "/messages/:path*", "/chats/:path*", "/disputes/:path*", "/subscriptions/:path*", "/admin/:path*"],
};
