"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { PRODUCT_STATUS_LABELS } from "@/lib/constants";

export function ProductsTab() {
  const [products, setProducts] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    fetch("/api/admin/products?status=all")
      .then(r => r.json())
      .then(d => { if (d.success) setProducts(d.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleAction = async (productId: string, action: string) => {
    const res = await fetch(`/api/admin/products/${productId}`, {
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
      <CardHeader><CardTitle className="text-lg">商品列表（{products.length}）</CardTitle></CardHeader>
      <CardContent>
        <div className="space-y-2 max-h-[600px] overflow-y-auto">
          {products.map(p => (
            <div key={String(p.id)} className="flex items-center justify-between p-3 border rounded-lg text-sm">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{String(p.title)}</span>
                  <Badge variant="outline">{PRODUCT_STATUS_LABELS[String(p.status)]?.label || String(p.status)}</Badge>
                </div>
                <div className="text-gray-500 mt-1">
                  卖家：{String((p.seller as Record<string, unknown>)?.nickname || "")} · ¥{String(p.price)}
                </div>
              </div>
              <div className="flex gap-1">
                {String(p.status) === "under_review" && (
                  <Button size="sm" onClick={() => handleAction(String(p.id), "approve")}>通过</Button>
                )}
                {String(p.status) === "active" && (
                  <Button size="sm" variant="outline" className="text-red-600" onClick={() => handleAction(String(p.id), "remove")}>下架</Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
