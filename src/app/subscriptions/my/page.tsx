"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import Link from "next/link";

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: "待支付", color: "bg-yellow-100 text-yellow-800" },
  active: { label: "生效中", color: "bg-green-100 text-green-800" },
  expired: { label: "已过期", color: "bg-gray-100 text-gray-600" },
  cancelled: { label: "已取消", color: "bg-red-100 text-red-800" },
};

interface Subscription {
  id: string; status: string; startDate: string | null; endDate: string | null; createdAt: string;
  plan: { id: string; name: string; price: number; deposit: number; maxBooks: number; semester: string };
  order: { id: string; orderNo: string; status: string; totalAmount: number; deposit: number | null } | null;
}

export default function MySubscriptionsPage() {
  const user = useAuthStore((s) => s.user);
  const router = useRouter();
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { router.push("/login"); return; }
    fetch("/api/subscriptions/my")
      .then(r => r.json())
      .then(d => { if (d.success) setSubs(d.data); setLoading(false); });
  }, [user, router]);

  const handleCancel = async (subId: string) => {
    if (!confirm("确定取消订阅？借阅中的教材将自动归还，押金退还到钱包。")) return;
    const res = await fetch("/api/subscriptions/my", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscriptionId: subId, action: "cancel" }),
    });
    const data = await res.json();
    if (data.success) {
      toast.success(data.data.message);
      setSubs(prev => prev.map(s => s.id === subId ? { ...s, status: "cancelled" } : s));
    } else toast.error(data.error);
  };

  if (!user) return null;

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">我的订阅</h1>
        <Link href="/textbooks/my" className="text-blue-600 hover:underline text-sm">我的教材</Link>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">加载中...</div>
      ) : subs.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="mb-2">暂无订阅</p>
          <Link href="/textbooks"><Button variant="outline">去订阅教材</Button></Link>
        </div>
      ) : (
        <div className="space-y-4">
          {subs.map((sub) => {
            const stInfo = STATUS_LABELS[sub.status] || { label: sub.status, color: "bg-gray-100" };
            return (
              <Card key={sub.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{sub.plan.name}</CardTitle>
                    <Badge className={stInfo.color}>{stInfo.label}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="grid grid-cols-2 gap-2">
                    <div><span className="text-gray-400">学期：</span>{sub.plan.semester}</div>
                    <div><span className="text-gray-400">套餐价：</span>¥{sub.plan.price}</div>
                    <div><span className="text-gray-400">押金：</span>¥{sub.plan.deposit}</div>
                    <div><span className="text-gray-400">最多借阅：</span>{sub.plan.maxBooks} 本</div>
                    {sub.startDate && <div><span className="text-gray-400">开始：</span>{new Date(sub.startDate).toLocaleDateString("zh-CN")}</div>}
                    {sub.endDate && <div><span className="text-gray-400">到期：</span>{new Date(sub.endDate).toLocaleDateString("zh-CN")}</div>}
                  </div>
                  {sub.order && (
                    <div className="text-xs text-gray-400 pt-1 border-t">
                      订单号：{sub.order.orderNo} · 合计 ¥{sub.order.totalAmount}
                    </div>
                  )}
                  {(sub.status === "active" || sub.status === "pending") && (
                    <Button variant="outline" size="sm" className="text-red-600 mt-2" onClick={() => handleCancel(sub.id)}>
                      取消订阅
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
