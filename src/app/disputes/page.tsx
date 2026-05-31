"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { DISPUTE_STATUS_LABELS } from "@/lib/constants";

interface Dispute {
  id: string;
  orderId: string;
  reason: string;
  description: string;
  status: string;
  resolution: string | null;
  createdAt: string;
  order: { orderNo: string; totalAmount: number; status: string };
  initiator: { id: string; nickname: string };
}

export default function DisputesPage() {
  const user = useAuthStore((s) => s.user);
  const router = useRouter();
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState<"mine" | "all">("mine");

  useEffect(() => {
    if (!user) { router.push("/login"); return; }
    fetch(`/api/disputes?scope=${scope}`)
      .then(r => r.json())
      .then(d => { if (d.success) setDisputes(d.data); setLoading(false); });
  }, [user, router, scope]);

  if (!user) return null;

  const isAdmin = user.roles.includes("admin");

  return (
    <div className="container mx-auto px-4 py-5 max-w-3xl">
      <h1 className="text-xl font-bold mb-4">投诉记录</h1>

      {isAdmin && (
        <div className="flex gap-2 mb-4">
          <button onClick={() => setScope("mine")}
            className={`px-4 py-2 rounded-lg text-sm ${scope === "mine" ? "bg-blue-600 text-white" : "bg-gray-100"}`}>
            我的投诉
          </button>
          <button onClick={() => setScope("all")}
            className={`px-4 py-2 rounded-lg text-sm ${scope === "all" ? "bg-blue-600 text-white" : "bg-gray-100"}`}>
            全部投诉
          </button>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-400">加载中...</div>
      ) : disputes.length === 0 ? (
        <div className="text-center py-12 text-gray-400">暂无投诉记录</div>
      ) : (
        <div className="space-y-3">
          {disputes.map((d) => {
            const status = DISPUTE_STATUS_LABELS[d.status] || { label: d.status, color: "bg-gray-100" };
            return (
              <Card key={d.id}>
                <CardContent className="py-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">订单 {d.order.orderNo}</span>
                        <Badge className={status.color}>{status.label}</Badge>
                      </div>
                      <p className="text-sm font-medium mt-1">{d.reason}</p>
                      <p className="text-sm text-gray-600 mt-1">{d.description}</p>
                    </div>
                    <span className="text-xs text-gray-400">{new Date(d.createdAt).toLocaleString("zh-CN")}</span>
                  </div>
                  {d.resolution && (
                    <div className="mt-2 p-2 bg-gray-50 rounded text-sm">
                      <span className="text-gray-500">处理结果：</span>{d.resolution}
                    </div>
                  )}
                  <div className="mt-2 flex gap-2">
                    <Link href={`/orders/${d.orderId}`}>
                      <Button variant="outline" size="sm">查看订单</Button>
                    </Link>
                    {isAdmin && d.status === "pending" && (
                      <Link href="/admin">
                        <Button size="sm">去后台处理</Button>
                      </Link>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
