"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAuthStore } from "@/stores/auth";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const ORDER_STATUS: Record<string, string> = {
  pending_payment: "待支付", paid: "已支付", shipped: "已发货", delivered: "已送达",
  in_progress: "进行中", completed: "已完成", cancelled: "已取消", disputed: "纠纷中",
};

const PRODUCT_STATUS: Record<string, string> = {
  active: "在售", sold: "已售", removed: "已下架", under_review: "审核中",
};

const DISPUTE_STATUS: Record<string, { label: string; color: string }> = {
  pending: { label: "待处理", color: "bg-yellow-100 text-yellow-800" },
  reviewing: { label: "审核中", color: "bg-blue-100 text-blue-800" },
  resolved: { label: "已解决", color: "bg-green-100 text-green-800" },
  rejected: { label: "已驳回", color: "bg-red-100 text-red-800" },
};

export default function AdminPage() {
  const user = useAuthStore((s) => s.user);
  const router = useRouter();
  const [tab, setTab] = useState<"dashboard" | "orders" | "products" | "disputes" | "users" | "cabinets" | "textbooks">("dashboard");
  const [stats, setStats] = useState<Record<string, unknown> | null>(null);
  const [auditLogs, setAuditLogs] = useState<Record<string, unknown>[]>([]);
  const [orders, setOrders] = useState<Record<string, unknown>[]>([]);
  const [products, setProducts] = useState<Record<string, unknown>[]>([]);
  const [disputes, setDisputes] = useState<Record<string, unknown>[]>([]);
  const [users, setUsers] = useState<Record<string, unknown>[]>([]);
  const [cabinetData, setCabinetData] = useState<Record<string, unknown> | null>(null);
  const [sanitizingCopies, setSanitizingCopies] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [disputeResolveId, setDisputeResolveId] = useState<string | null>(null);
  const [resolution, setResolution] = useState("");
  const [inspectCopyId, setInspectCopyId] = useState<string | null>(null);
  const [inspectResult, setInspectResult] = useState("pass");
  const [inspectCondition, setInspectCondition] = useState("good");

  useEffect(() => {
    if (!user || !user.roles.includes("admin")) { router.push("/"); return; }
    loadTab(tab);
  }, [tab, user, router]);

  const loadTab = async (t: string) => {
    setLoading(true);
    try {
      if (t === "dashboard") {
        const res = await fetch("/api/admin/stats");
        const d = await res.json();
        if (d.success) { setStats(d.data.stats); setAuditLogs(d.data.recentAuditLogs); }
      } else if (t === "orders") {
        const res = await fetch("/api/admin/orders?status=all");
        const d = await res.json();
        if (d.success) setOrders(d.data.orders);
      } else if (t === "products") {
        const res = await fetch("/api/admin/products?status=all");
        const d = await res.json();
        if (d.success) setProducts(d.data);
      } else if (t === "disputes") {
        const res = await fetch("/api/disputes?scope=all");
        const d = await res.json();
        if (d.success) setDisputes(d.data);
      } else if (t === "users") {
        const res = await fetch("/api/admin/users");
        const d = await res.json();
        if (d.success) setUsers(d.data);
      } else if (t === "cabinets") {
        const res = await fetch("/api/cabinets/dashboard");
        const d = await res.json();
        if (d.success) setCabinetData(d.data);
      } else if (t === "textbooks") {
        const res = await fetch("/api/textbooks/admin");
        const d = await res.json();
        if (d.success) setSanitizingCopies(d.data);
      }
    } catch { /* ignore */ }
    setLoading(false);
  };

  const handleOrderAction = async (orderId: string, action: string) => {
    const res = await fetch(`/api/admin/orders/${orderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const d = await res.json();
    if (d.success) { toast.success("操作成功"); loadTab("orders"); } else toast.error(d.error);
  };

  const handleProductAction = async (productId: string, action: string) => {
    const res = await fetch(`/api/admin/products/${productId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const d = await res.json();
    if (d.success) { toast.success("操作成功"); loadTab("products"); } else toast.error(d.error);
  };

  const handleDisputeAction = async (disputeId: string, action: string) => {
    const res = await fetch(`/api/disputes/${disputeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, resolution }),
    });
    const d = await res.json();
    if (d.success) {
      toast.success("处理成功");
      setDisputeResolveId(null);
      setResolution("");
      loadTab("disputes");
    } else toast.error(d.error);
  };

  const handleUserBan = async (userId: string, ban: boolean) => {
    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, action: ban ? "ban" : "unban" }),
    });
    const d = await res.json();
    if (d.success) { toast.success(ban ? "已封禁" : "已解封"); loadTab("users"); } else toast.error(d.error);
  };

  const handleInspect = async (copyId: string, action: string) => {
    const res = await fetch("/api/textbooks/inspect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        copyId,
        ...(action === "sanitize" ? { sanitizeComplete: true, conditionAfter: inspectCondition } : { result: inspectResult, conditionAfter: inspectCondition }),
      }),
    });
    const d = await res.json();
    if (d.success) {
      toast.success(d.data.message || "操作成功");
      setInspectCopyId(null);
      loadTab("textbooks");
    } else toast.error(d.error);
  };

  if (!user || !user.roles.includes("admin")) return null;

  const tabs = [
    { key: "dashboard", label: "数据看板" },
    { key: "orders", label: "订单管理" },
    { key: "products", label: "商品管理" },
    { key: "disputes", label: "投诉处理" },
    { key: "users", label: "用户管理" },
    { key: "cabinets", label: "柜机管理" },
    { key: "textbooks", label: "教材管理" },
  ] as const;

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-4">运营后台</h1>

      <div className="flex gap-1 mb-6 border-b overflow-x-auto">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${tab === t.key ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? <div className="text-center py-12 text-gray-400">加载中...</div> : (
        <>
          {/* 数据看板 */}
          {tab === "dashboard" && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                {[
                  { label: "用户总数", value: (stats as Record<string, unknown>)?.userCount, icon: "👥" },
                  { label: "活跃商品", value: (stats as Record<string, unknown>)?.productCount, icon: "📦" },
                  { label: "订单总数", value: (stats as Record<string, unknown>)?.orderCount, icon: "📋" },
                  { label: "开放任务", value: (stats as Record<string, unknown>)?.taskCount, icon: "🎯" },
                  { label: "智能柜", value: (stats as Record<string, unknown>)?.cabinetCount, icon: "🔐" },
                  { label: "教材种类", value: (stats as Record<string, unknown>)?.textbookCount, icon: "📚" },
                  { label: "总交易额", value: `¥${(stats as Record<string, unknown>)?.totalRevenue || 0}`, icon: "💰" },
                ].map((item) => (
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
                    {auditLogs.map((log: Record<string, unknown>) => (
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
          )}

          {/* 订单管理 */}
          {tab === "orders" && (
            <Card>
              <CardHeader><CardTitle className="text-lg">订单列表（{orders.length}）</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-[600px] overflow-y-auto">
                  {orders.map((o: Record<string, unknown>) => (
                    <div key={String(o.id)} className="flex items-center justify-between p-3 border rounded-lg text-sm">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs">{String(o.orderNo)}</span>
                          <Badge variant="outline">{ORDER_STATUS[String(o.status)] || String(o.status)}</Badge>
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
                            <Button size="sm" variant="outline" onClick={() => handleOrderAction(String(o.id), "complete")}>完成</Button>
                            <Button size="sm" variant="outline" className="text-red-600" onClick={() => handleOrderAction(String(o.id), "cancel")}>取消</Button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* 商品管理 */}
          {tab === "products" && (
            <Card>
              <CardHeader><CardTitle className="text-lg">商品列表（{products.length}）</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-[600px] overflow-y-auto">
                  {products.map((p: Record<string, unknown>) => (
                    <div key={String(p.id)} className="flex items-center justify-between p-3 border rounded-lg text-sm">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{String(p.title)}</span>
                          <Badge variant="outline">{PRODUCT_STATUS[String(p.status)] || String(p.status)}</Badge>
                        </div>
                        <div className="text-gray-500 mt-1">
                          卖家：{String((p.seller as Record<string, unknown>)?.nickname || "")} · ¥{String(p.price)}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        {String(p.status) === "under_review" && (
                          <Button size="sm" onClick={() => handleProductAction(String(p.id), "approve")}>通过</Button>
                        )}
                        {String(p.status) === "active" && (
                          <Button size="sm" variant="outline" className="text-red-600" onClick={() => handleProductAction(String(p.id), "remove")}>下架</Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* 投诉处理 */}
          {tab === "disputes" && (
            <Card>
              <CardHeader><CardTitle className="text-lg">投诉列表（{disputes.length}）</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-3 max-h-[600px] overflow-y-auto">
                  {disputes.map((d: Record<string, unknown>) => {
                    const ds = DISPUTE_STATUS[String(d.status)] || { label: String(d.status), color: "bg-gray-100" };
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
                            {disputeResolveId === d.id ? (
                              <>
                                <textarea value={resolution} onChange={e => setResolution(e.target.value)}
                                  placeholder="处理意见..." className="w-full border rounded p-2 text-sm" rows={2} />
                                <div className="flex gap-2">
                                  <Button size="sm" onClick={() => handleDisputeAction(String(d.id), "resolve")}>解决</Button>
                                  <Button size="sm" variant="outline" className="text-red-600" onClick={() => handleDisputeAction(String(d.id), "reject")}>驳回</Button>
                                  <Button size="sm" variant="ghost" onClick={() => setDisputeResolveId(null)}>取消</Button>
                                </div>
                              </>
                            ) : (
                              <Button size="sm" onClick={() => setDisputeResolveId(String(d.id))}>处理</Button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* 用户管理 */}
          {tab === "users" && (
            <Card>
              <CardHeader><CardTitle className="text-lg">用户列表（{users.length}）</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-[600px] overflow-y-auto">
                  {users.map((u: Record<string, unknown>) => (
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
                          <Button size="sm" variant="outline" className="text-red-600" onClick={() => handleUserBan(String(u.id), true)}>封禁</Button>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => handleUserBan(String(u.id), false)}>解封</Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* 柜机管理 */}
          {tab === "cabinets" && cabinetData && (
            <>
              {/* 概览 */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                {[
                  { label: "总柜格", value: (cabinetData.overview as Record<string, unknown>)?.totalSlots },
                  { label: "使用率", value: `${(cabinetData.overview as Record<string, unknown>)?.usageRate}%` },
                  { label: "平均周转", value: `${(cabinetData.overview as Record<string, unknown>)?.avgTurnoverHours}h` },
                  { label: "交易成功率", value: `${(cabinetData.overview as Record<string, unknown>)?.tradeSuccessRate}%` },
                  { label: "已占用", value: (cabinetData.overview as Record<string, unknown>)?.occupiedSlots },
                  { label: "故障", value: (cabinetData.overview as Record<string, unknown>)?.faultSlots },
                  { label: "空闲", value: (cabinetData.overview as Record<string, unknown>)?.emptySlots },
                  { label: "已过期", value: (cabinetData.overview as Record<string, unknown>)?.expiredCount },
                ].map((item) => (
                  <Card key={item.label}>
                    <CardContent className="pt-4 text-center">
                      <div className="text-xl font-bold">{String(item.value ?? 0)}</div>
                      <div className="text-xs text-gray-500">{item.label}</div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* 各柜机详情 */}
              <div className="space-y-4">
                {(cabinetData.cabinets as Record<string, unknown>[]).map((c) => (
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
          )}

          {/* 教材管理 */}
          {tab === "textbooks" && (
            <Card>
              <CardHeader><CardTitle className="text-lg">待处理教材（{sanitizingCopies.length}）</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-3 max-h-[600px] overflow-y-auto">
                  {sanitizingCopies.length === 0 ? (
                    <p className="text-gray-400 text-center py-8">暂无待处理教材</p>
                  ) : sanitizingCopies.map((c: Record<string, unknown>) => {
                    const tb = c.textbook as Record<string, unknown>;
                    const status = String(c.status);
                    return (
                      <div key={String(c.id)} className="p-3 border rounded-lg text-sm">
                        <div className="flex items-center justify-between mb-2">
                          <div>
                            <span className="font-medium">{String(tb?.title || "")}</span>
                            <span className="text-xs text-gray-400 ml-2">{String(tb?.isbn || "")}</span>
                            <Badge className="ml-2" variant="outline">{String(c.copyNumber)}</Badge>
                            <Badge className="ml-1" variant={status === "sanitizing" ? "secondary" : "default"}>
                              {status === "sanitizing" ? "待消毒" : status === "borrowed" ? "借出中" : status}
                            </Badge>
                          </div>
                        </div>
                        <div className="text-xs text-gray-500">当前成色：{String(c.condition)}</div>
                        {status === "sanitizing" && (
                          <div className="mt-2 space-y-2">
                            {inspectCopyId === c.id ? (
                              <div className="flex flex-wrap gap-2 items-center">
                                <select value={inspectCondition} onChange={e => setInspectCondition(e.target.value)}
                                  className="border rounded px-2 py-1 text-xs">
                                  <option value="new">全新</option><option value="like_new">近新</option>
                                  <option value="good">良好</option><option value="acceptable">可用</option>
                                </select>
                                <select value={inspectResult} onChange={e => setInspectResult(e.target.value)}
                                  className="border rounded px-2 py-1 text-xs">
                                  <option value="pass">通过</option><option value="minor_damage">轻微损坏(¥10)</option>
                                  <option value="major_damage">严重损坏(¥30)</option><option value="retired">报废(¥50)</option>
                                </select>
                                <Button size="sm" onClick={() => handleInspect(String(c.id), "inspect")}>质检</Button>
                                <Button size="sm" variant="outline" onClick={() => handleInspect(String(c.id), "sanitize")}>消毒完成上架</Button>
                                <Button size="sm" variant="ghost" onClick={() => setInspectCopyId(null)}>取消</Button>
                              </div>
                            ) : (
                              <Button size="sm" onClick={() => setInspectCopyId(String(c.id))}>处理</Button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
