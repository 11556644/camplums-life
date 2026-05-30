"use client";

import { useEffect } from "react";
import { useAuthStore } from "@/stores/auth";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const fetchUser = useAuthStore((s) => s.fetchUser);
  const loading = useAuthStore((s) => s.loading);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  // 加载中不渲染子组件，防止页面误判为未登录跳转
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-400 text-sm">加载中...</div>
      </div>
    );
  }

  return <>{children}</>;
}
