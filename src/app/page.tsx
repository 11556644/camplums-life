import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const features = [
  { title: "闲置市场", desc: "买卖闲置物品，让旧物找到新主人", href: "/products", icon: "📦" },
  { title: "自由市场", desc: "跑腿、代取、辅导、技能交换", href: "/tasks", icon: "🤝" },
  { title: "智能柜", desc: "24小时自助存取，解决时间对不上的问题", href: "/cabinets", icon: "🔐" },
  { title: "书籍订阅", desc: "按学期租教材，课外读物也能借", href: "/textbooks", icon: "📚" },
  { title: "校园贴吧", desc: "分享校园生活，交流学习心得", href: "/forum", icon: "💬" },
];

export default function HomePage() {
  return (
    <div className="container mx-auto px-4 py-12">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold mb-4" style={{ fontFamily: 'var(--font-display)' }}>
          <span className="text-creative-gradient">校园生活服务平台</span>
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto font-medium">
          闲置交易 · 智能柜寄存 · 书籍订阅 · 校园贴吧 · 技能互换
        </p>
        <p className="text-sm text-muted-foreground/60 mt-2">
          让校园资源流转起来
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
        {features.map((f) => (
          <Link key={f.href} href={f.href} className="group outline-none">
            <Card className="glass-card h-full transition-all duration-[400ms] ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:-translate-y-2 hover:shadow-xl active:scale-[0.97]">
              <CardHeader className="text-center">
                <div className="text-4xl mb-2 transition-transform duration-[400ms] ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover:scale-110">{f.icon}</div>
                <CardTitle className="text-lg">{f.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-center">{f.desc}</CardDescription>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="mt-16 text-center">
        <div className="inline-flex items-center rounded-full glass-card px-4 py-1.5 text-sm text-muted-foreground">
          <span className="mr-2 h-2 w-2 rounded-full bg-green-500 animate-pulse" />
          系统运行中 · 示例大学
        </div>
      </div>
    </div>
  );
}
