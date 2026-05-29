"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth";
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

  useEffect(() => {
    if (!user) return;
    const fetchUnread = async () => {
      try {
        const res = await fetch("/api/messages/unread");
        const data = await res.json();
        if (data.success) setUnread(data.data);
      } catch { /* ignore */ }
    };
    fetchUnread();
    const timer = setInterval(fetchUnread, 10000);
    return () => clearInterval(timer);
  }, [user]);

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/60">
      <div className="container mx-auto flex h-14 items-center px-4">
        <Link href="/" className="mr-6 flex items-center space-x-2">
          <span className="text-lg font-bold text-blue-600">校园生活</span>
        </Link>

        <nav className="flex items-center space-x-4 text-sm font-medium">
          <Link href="/products" className="text-gray-600 hover:text-gray-900">闲置市场</Link>
          <Link href="/tasks" className="text-gray-600 hover:text-gray-900">自由市场</Link>
          <Link href="/cabinets" className="text-gray-600 hover:text-gray-900">智能柜</Link>
          <Link href="/textbooks" className="text-gray-600 hover:text-gray-900">书籍订阅</Link>
        </nav>

        <div className="ml-auto flex items-center space-x-3">
          <Link href="/forum" className="text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors mr-2">校园贴吧</Link>
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
