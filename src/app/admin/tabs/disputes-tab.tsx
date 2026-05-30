"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { DISPUTE_STATUS_LABELS } from "@/lib/constants";

export function DisputesTab() {
  const [disputes, setDisputes] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolveId, setResolveId] = useState<string | null>(null);
  const [resolution, setResolution] = useState("");

  const load = () => {
    setLoading(true);
    fetch("/api/disputes?scope=all")
      .then(r => r.json())
      .then(d => { if (d.success) setDisputes(d.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleAction = async (disputeId: string, action: string) => {
    const res = await fetch(`/api/disputes/${disputeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, resolution }),
    });
    const d = await res.json();
    if (d.success) {
      toast.success("处理成功");
      setResolveId(null);
      setResolution("");
      load();
    } else toast.error(d.error);
  };

  if (loading) return <div className="text-center py-12 text-gray-400">加载中...</div>;

  return (
    <Card>
      <CardHeader><CardTitle className="text-lg">投诉列表（{disputes.length}）</CardTitle></CardHeader>
      <CardContent>
        <div className="space-y-3 max-h-[600px] overflow-y-auto">
          {disputes.map(d => {
            const ds = DISPUTE_STATUS_LABELS[String(d.status)] || { label: String(d.status), color: "bg-gray-100" };
            return (
              <div key={String(d.id)} className="p-3 border rounded-lg text-sm">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">订单 {(d.order as Record<string, unknown>)?.orderNo as string}</span>
                    <Badge className={ds.color}>{ds.label}</Badge>
                  </div>
                  <span className="text-xs text-gray-400">{new Date(String(d.createdAt)).toLocaleString("zh-CN")}</span>
                </div>
                <p className="font-medium text-red-600">{String(d.reason)}</p>
                <p className="text-gray-600 mt-1">{String(d.description)}</p>
                {String(d.resolution || "") && <p className="mt-2 text-green-700 bg-green-50 p-2 rounded">处理结果：{String(d.resolution)}</p>}
                {String(d.status) === "pending" && (
                  <div className="mt-3 space-y-2">
                    {resolveId === d.id ? (
                      <>
                        <textarea value={resolution} onChange={e => setResolution(e.target.value)}
                          placeholder="处理意见..." className="w-full border rounded p-2 text-sm" rows={2} />
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => handleAction(String(d.id), "resolve")}>解决</Button>
                          <Button size="sm" variant="outline" className="text-red-600" onClick={() => handleAction(String(d.id), "reject")}>驳回</Button>
                          <Button size="sm" variant="ghost" onClick={() => setResolveId(null)}>取消</Button>
                        </div>
                      </>
                    ) : (
                      <Button size="sm" onClick={() => setResolveId(String(d.id))}>处理</Button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
