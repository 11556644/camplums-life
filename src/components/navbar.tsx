"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth";
import { useRealtime } from "@/hooks/use-realtime";
import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export function Navbar() {
  const { user, loading, logout } = useAuthStore();
  const router = useRouter();
  const [unread, setUnread] = useState({ total: 0, messages: 0, chats: 0 });

  // 首次加载获取未读数
  useEffect(() => {
    if (!user) return;
    fetch("/api/messages/unread")
      .then(r => r.json())
      .then(d => { if (d.success) setUnread(d.data); })
      .catch(() => {});
  }, [user]);

  // SSE 实时更新未读数
  const handleRealtime = useCallback((event: { type: string; action: string; data?: Record<string, unknown> }) => {
    if (event.type === "message") {
      fetch("/api/messages/unread")
        .then(r => r.json())
        .then(d => { if (d.success) setUnread(d.data); })
        .catch(() => {});
    }
  }, []);

  useRealtime(handleRealtime, []);

  // 监听消息已读事件（来自 messages/chats 页面标记已读后）
  useEffect(() => {
    if (!user) return;
    const refresh = () => {
      fetch("/api/messages/unread")
        .then(r => r.json())
        .then(d => { if (d.success) setUnread(d.data); })
        .catch(() => {});
    };
    window.addEventListener("unread-updated", refresh);
    return () => window.removeEventListener("unread-updated", refresh);
  }, [user]);

  return (
    <header className="sticky top-0 z-50 w-full glass-card border-b border-glass-border">
      <div className="container mx-auto flex h-16 items-center px-4">
        <Link href="/" className="mr-10 flex items-center space-x-2 group">
          <span className="text-xl font-extrabold tracking-tight text-creative-gradient group-hover:opacity-80 transition-opacity" style={{ fontFamily: 'var(--font-display)' }}>
            校园生活
          </span>
        </Link>

        <nav className="hidden lg:flex items-center space-x-6 text-sm font-semibold tracking-tight">
          <Link href="/products" className="text-muted-foreground hover:text-primary transition-colors">闲置市场</Link>
          <Link href="/tasks" className="text-muted-foreground hover:text-primary transition-colors">自由市场</Link>
          <Link href="/cabinets" className="text-muted-foreground hover:text-primary transition-colors">智能柜</Link>
          <Link href="/textbooks" className="text-muted-foreground hover:text-primary transition-colors">书籍订阅</Link>
        </nav>

        <div className="ml-auto flex items-center space-x-3">
          <Link href="/forum" className="text-sm font-semibold tracking-tight text-muted-foreground hover:text-primary transition-colors mr-2">校园贴吧</Link>
          {loading ? (
            <div className="h-8 w-16 animate-pulse rounded bg-gray-200" />
          ) : user ? (
            <div className="flex items-center gap-2">
              {/* 未读消息指示器 */}
              {unread.total > 0 && (
                <button onClick={() => router.push(unread.chats > 0 ? "/chats" : "/messages")}
                  className="relative p-1 text-gray-400 hover:text-blue-600 transition-colors">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>
                  </svg>
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">
                    {unread.total > 9 ? "9+" : unread.total}
                  </span>
                </button>
              )}

              <DropdownMenu>
                <DropdownMenuTrigger className="relative h-8 w-8 rounded-full cursor-pointer">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback>{user.nickname[0]}</AvatarFallback>
                  </Avatar>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <div className="px-2 py-1.5">
                    <p className="text-sm font-medium">{user.nickname}</p>
                    <p className="text-xs text-gray-500">{user.roles.join(", ")}</p>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => router.push("/profile")}>我的</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => router.push("/orders")}>我的订单</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => router.push("/wallet")}>我的钱包</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => router.push("/chats")}>
                    聊天{unread.chats > 0 && <span className="ml-auto bg-red-500 text-white text-xs rounded-full px-1.5">{unread.chats}</span>}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => router.push("/messages")}>
                    消息通知{unread.messages > 0 && <span className="ml-auto bg-red-500 text-white text-xs rounded-full px-1.5">{unread.messages}</span>}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => router.push("/disputes")}>投诉记录</DropdownMenuItem>
                  {user.roles.includes("admin") && (
                    <DropdownMenuItem onClick={() => router.push("/admin")}>运营后台</DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={logout} variant="destructive">退出登录</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ) : (
            <div className="space-x-2">
              <Link href="/login" className={buttonVariants({ variant: "ghost" })}>登录</Link>
              <Link href="/register" className={buttonVariants()}>注册</Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
