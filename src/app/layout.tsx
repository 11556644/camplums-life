import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/components/providers/auth-provider";
import { Navbar } from "@/components/layout/navbar";
import { Toaster } from "@/components/ui/sonner";
import { ErrorBoundary } from "@/components/layout/error-boundary";
import { SSEProvider } from "@/components/providers/sse-provider";

export const metadata: Metadata = {
  title: "校园生活服务平台",
  description: "校园闲置物品交易、智能柜寄存、书籍订阅、校园贴吧、自由市场",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <head>
        <style dangerouslySetInnerHTML={{ __html: `
          :root {
            --font-display: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", Helvetica, Arial, sans-serif;
            --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", Helvetica, Arial, sans-serif;
          }
        `}} />
      </head>
      <body
        className="min-h-full flex flex-col"
        style={{ fontFamily: "var(--font-sans)" }}
      >
        <AuthProvider>
          <SSEProvider>
            <Navbar />
            <ErrorBoundary>
              <main className="flex-1">{children}</main>
            </ErrorBoundary>
            <Toaster />
          </SSEProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
