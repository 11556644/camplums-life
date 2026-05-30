"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ORDER_STATUS_LABELS } from "@/lib/constants";

export function OrdersTab() {
  const [orders, setOrders] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    fetch("/api/admin/orders?status=all")
      .then(r => r.json())
      .then(d => { if (d.success) setOrders(d.data.orders); })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleAction = async (orderId: string, action: string) => {
    const res = await fetch(`/api/admin/orders/${orderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const d = await res.json();
    if (d.success) { toast.success("操作成功"); load(); } else toast.error(d.error);
  };

  if (loading) return <div className="text-center py-12 text-gray-400">加载中...</div>;

  return (
    <Card>
      <CardHeader><CardTitle className="text-lg">订单列表（{orders.length}）</CardTitle></CardHeader>
      <CardContent>
        <div className="space-y-2 max-h-[600px] overflow-y-auto">
          {orders.map(o => (
            <div key={String(o.id)} className="flex items-center justify-between p-3 border rounded-lg text-sm">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs">{String(o.orderNo)}</span>
                  <Badge variant="outline">{ORDER_STATUS_LABELS[String(o.status)]?.label || String(o.status)}</Badge>
                </div>
                <div className="text-gray-500 mt-1">
                  买家：{String((o.buyer as Record<string, unknown>)?.nickname || "")} ·
                  卖家：{String((o.seller as Record<string, unknown>)?.nickname || "")} ·
                  ¥{String(o.totalAmount)}
                </div>
              </div>
              <div className="flex gap-1">
                {String(o.status) !== "completed" && String(o.status) !== "cancelled" && (
                  <>
                    <Button size="sm" variant="outline" onClick={() => handleAction(String(o.id), "complete")}>完成</Button>
                    <Button size="sm" variant="outline" className="text-red-600" onClick={() => handleAction(String(o.id), "cancel")}>取消</Button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
