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

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 只对 API 路由限流
  if (!pathname.startsWith("/api/")) return NextResponse.next();

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

  // 安全 Headers
  const response = NextResponse.next();
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-XSS-Protection", "1; mode=block");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  return response;
}

export const config = {
  matcher: "/api/:path*",
};
