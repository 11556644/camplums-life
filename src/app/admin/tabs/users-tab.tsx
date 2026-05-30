"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function UsersTab() {
  const [users, setUsers] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    fetch("/api/admin/users")
      .then(r => r.json())
      .then(d => { if (d.success) setUsers(d.data.users || d.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleBan = async (userId: string, ban: boolean) => {
    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, status: ban ? "banned" : "active" }),
    });
    const d = await res.json();
    if (d.success) { toast.success(ban ? "已封禁" : "已解封"); load(); } else toast.error(d.error);
  };

  if (loading) return <div className="text-center py-12 text-gray-400">加载中...</div>;

  return (
    <Card>
      <CardHeader><CardTitle className="text-lg">用户列表（{users.length}）</CardTitle></CardHeader>
      <CardContent>
        <div className="space-y-2 max-h-[600px] overflow-y-auto">
          {users.map(u => (
            <div key={String(u.id)} className="flex items-center justify-between p-3 border rounded-lg text-sm">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{String(u.nickname)}</span>
                  {(u.roles as { role: string }[])?.map(r => <Badge key={r.role} variant="secondary" className="text-xs">{r.role}</Badge>)}
                  <span className="text-xs text-gray-400">{String(u.phone || "")}</span>
                </div>
                <div className="text-gray-500 mt-1">
                  信用分：{String((u.creditScore as Record<string, unknown>)?.score ?? 100)} ·
                  订单：{String((u._count as Record<string, unknown>)?.buyerOrders ?? 0)}买/{String((u._count as Record<string, unknown>)?.sellerOrders ?? 0)}卖
                </div>
              </div>
              <div className="flex gap-1">
                <Link href={`/user/${String(u.id)}`}><Button size="sm" variant="ghost">查看</Button></Link>
                {u.status === "active" ? (
                  <Button size="sm" variant="outline" className="text-red-600" onClick={() => handleBan(String(u.id), true)}>封禁</Button>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => handleBan(String(u.id), false)}>解封</Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
