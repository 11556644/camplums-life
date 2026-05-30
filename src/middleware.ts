import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

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

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ==================== API 限流 ====================
  if (pathname.startsWith("/api/")) {
    const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown";

    // 认证接口：5次/分钟
    if (pathname.startsWith("/api/auth/")) {
      if (!getRateLimit(`auth:${ip}`, 5, 60_000)) {
        return NextResponse.json({ error: "请求过于频繁，请稍后再试" }, { status: 429 });
      }
    }

    // 支付接口：10次/分钟
    if (pathname.startsWith("/api/wallet") || pathname.includes("/rate")) {
      if (!getRateLimit(`pay:${ip}`, 10, 60_000)) {
        return NextResponse.json({ error: "请求过于频繁，请稍后再试" }, { status: 429 });
      }
    }

    // 发布接口：20次/分钟
    if (pathname.includes("/publish")) {
      if (!getRateLimit(`publish:${ip}`, 20, 60_000)) {
        return NextResponse.json({ error: "请求过于频繁，请稍后再试" }, { status: 429 });
      }
    }

    // 通用 API：100次/分钟
    if (!getRateLimit(`api:${ip}`, 100, 60_000)) {
      return NextResponse.json({ error: "请求过于频繁，请稍后再试" }, { status: 429 });
    }

    return NextResponse.next();
  }

  // ==================== 页面路由保护 ====================
  // 检查是否有 auth cookie（轻量级检查，不验证 JWT）
  const hasToken = request.cookies.has("auth_token");

  // 需要登录的页面
  if (AUTH_PAGES.some(p => pathname.startsWith(p))) {
    if (!hasToken) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("from", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  // 管理页面需要登录（角色检查在客户端完成）
  if (pathname.startsWith("/admin")) {
    if (!hasToken) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*", "/profile/:path*", "/orders/:path*", "/wallet/:path*", "/messages/:path*", "/chats/:path*", "/disputes/:path*", "/subscriptions/:path*", "/admin/:path*"],
};
