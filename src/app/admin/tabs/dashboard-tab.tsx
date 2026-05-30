"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function DashboardTab() {
  const [stats, setStats] = useState<Record<string, unknown> | null>(null);
  const [auditLogs, setAuditLogs] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/stats")
      .then(r => r.json())
      .then(d => {
        if (d.success) { setStats(d.data.stats); setAuditLogs(d.data.recentAuditLogs); }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-center py-12 text-gray-400">加载中...</div>;

  const statItems = [
    { label: "用户总数", value: stats?.userCount, icon: "👥" },
    { label: "活跃商品", value: stats?.productCount, icon: "📦" },
    { label: "订单总数", value: stats?.orderCount, icon: "📋" },
    { label: "开放任务", value: stats?.taskCount, icon: "🎯" },
    { label: "智能柜", value: stats?.cabinetCount, icon: "🔐" },
    { label: "教材种类", value: stats?.textbookCount, icon: "📚" },
    { label: "总交易额", value: `¥${stats?.totalRevenue || 0}`, icon: "💰" },
  ];

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {statItems.map(item => (
          <Card key={item.label}>
            <CardContent className="pt-4 text-center">
              <div className="text-2xl mb-1">{item.icon}</div>
              <div className="text-2xl font-bold">{String(item.value ?? 0)}</div>
              <div className="text-sm text-gray-500">{item.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader><CardTitle className="text-lg">最近操作日志</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {auditLogs.map(log => (
              <div key={String(log.id)} className="flex items-center justify-between py-2 border-b last:border-0 text-sm">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{String(log.action)}</Badge>
                  <span>{String((log.user as Record<string, unknown>)?.nickname || "系统")}</span>
                  <span className="text-gray-500">{String(log.detail || "")}</span>
                </div>
                <span className="text-xs text-gray-400">{new Date(String(log.createdAt)).toLocaleString("zh-CN")}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </>
  );
}
