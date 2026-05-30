"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function CabinetsTab() {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/cabinets/dashboard")
      .then(r => r.json())
      .then(d => { if (d.success) setData(d.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-center py-12 text-gray-400">加载中...</div>;
  if (!data) return <div className="text-center py-12 text-gray-400">无数据</div>;

  const overview = data.overview as Record<string, unknown>;

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: "总柜格", value: overview?.totalSlots },
          { label: "使用率", value: `${overview?.usageRate}%` },
          { label: "平均周转", value: `${overview?.avgTurnoverHours}h` },
          { label: "交易成功率", value: `${overview?.tradeSuccessRate}%` },
          { label: "已占用", value: overview?.occupiedSlots },
          { label: "故障", value: overview?.faultSlots },
          { label: "空闲", value: overview?.emptySlots },
          { label: "已过期", value: overview?.expiredCount },
        ].map(item => (
          <Card key={item.label}>
            <CardContent className="pt-4 text-center">
              <div className="text-xl font-bold">{String(item.value ?? 0)}</div>
              <div className="text-xs text-gray-500">{item.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="space-y-4">
        {(data.cabinets as Record<string, unknown>[]).map(c => (
          <Card key={String(c.id)}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">{String(c.name)}</CardTitle>
                  <p className="text-xs text-gray-500">{String(c.location)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={c.status === "online" ? "default" : "secondary"}>
                    {c.status === "online" ? "在线" : String(c.status)}
                  </Badge>
                  <span className="text-sm font-medium">{String(c.usageRate)}% 使用</span>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex gap-4 text-sm">
                <span className="text-green-600">空闲 {String(c.empty)}</span>
                <span className="text-red-600">占用 {String(c.occupied)}</span>
                <span className="text-gray-500">故障 {String(c.fault)}</span>
                <span className="text-gray-400">共 {String(c.total)}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
