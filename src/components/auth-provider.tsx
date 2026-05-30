"use client";

import { useEffect } from "react";
import { useAuthStore } from "@/stores/auth";

function AuthSkeleton() {
  return (
    <div className="min-h-screen flex flex-col" suppressHydrationWarning>
      {/* 导航栏骨架 */}
      <header className="sticky top-0 z-50 w-full border-b bg-white/95 backdrop-blur">
        <div className="container mx-auto flex h-14 items-center px-4">
          <div className="h-5 w-20 bg-gray-200 rounded animate-pulse" />
          <div className="flex items-center space-x-4 ml-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-4 w-12 bg-gray-200 rounded animate-pulse" />
            ))}
          </div>
          <div className="ml-auto flex items-center space-x-3">
            <div className="h-8 w-16 bg-gray-200 rounded animate-pulse" />
            <div className="h-8 w-8 bg-gray-200 rounded-full animate-pulse" />
          </div>
        </div>
      </header>
      {/* 内容骨架 */}
      <main className="flex-1 container mx-auto px-4 py-8">
        <div className="space-y-4">
          <div className="h-8 w-48 bg-gray-200 rounded animate-pulse" />
          <div className="h-4 w-72 bg-gray-100 rounded animate-pulse" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mt-8">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="border rounded-lg p-6 space-y-3">
                <div className="h-10 w-10 bg-gray-200 rounded animate-pulse mx-auto" />
                <div className="h-5 w-20 bg-gray-200 rounded animate-pulse mx-auto" />
                <div className="h-4 w-28 bg-gray-100 rounded animate-pulse mx-auto" />
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const fetchUser = useAuthStore((s) => s.fetchUser);
  const loading = useAuthStore((s) => s.loading);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  if (loading) {
    return <AuthSkeleton />;
  }

  return <>{children}</>;
}
