import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/components/auth-provider";
import { Navbar } from "@/components/navbar";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: "校园生活服务平台",
  description: "校园闲置物品交易、智能柜寄存、教材订阅、自由市场",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <head>
        {/* 中国网络友好的字体回退链，不依赖 Google Fonts CDN */}
        <style dangerouslySetInnerHTML={{ __html: `
          :root {
            --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", Helvetica, Arial, sans-serif;
            --font-mono: "SF Mono", "Fira Code", "Fira Mono", "Roboto Mono", "Courier New", Courier, monospace;
          }
        `}} />
      </head>
      <body
        className="min-h-full flex flex-col"
        style={{ fontFamily: "var(--font-sans)" }}
      >
        <AuthProvider>
          <Navbar />
          <main className="flex-1">{children}</main>
          <Toaster />
        </AuthProvider>
      </body>
    </html>
  );
}
