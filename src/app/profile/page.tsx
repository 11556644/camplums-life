"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/stores/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface UserProfile {
  id: string;
  nickname: string;
  phone: string;
  studentId: string | null;
  department: string | null;
  dormitory: string | null;
  roomNumber: string | null;
  enrollYear: number | null;
  roles: { role: string }[];
  creditScore: { score: number } | null;
  wallet: { balance: number; frozen: number } | null;
  products: { id: string; title: string; price: number; status: string }[];
  tasks: { id: string; title: string; budget: number | null; status: string }[];
  buyerOrders: { id: string; orderNo: string; status: string; totalAmount: number; createdAt: string }[];
  sellerOrders: { id: string; orderNo: string; status: string; totalAmount: number; createdAt: string }[];
}

const STATUS_LABELS: Record<string, string> = {
  pending_payment: "待支付", paid: "已支付", shipped: "已发货", delivered: "已送达",
  completed: "已完成", cancelled: "已取消", disputed: "争议中",
};

const ROLE_LABELS: Record<string, string> = {
  buyer: "买家", seller: "卖家", floor_leader: "楼长",
  service_provider: "技能服务者", admin: "管理员",
};

export default function ProfilePage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ nickname: "", department: "", dormitory: "", roomNumber: "" });
  const [tab, setTab] = useState<"orders" | "published" | "tasks">("orders");

  useEffect(() => {
    if (!user) { router.push("/login"); return; }
    fetch("/api/user").then(r => r.json()).then(d => {
      if (d.success) {
        setProfile(d.data);
        setForm({
          nickname: d.data.nickname,
          department: d.data.department || "",
          dormitory: d.data.dormitory || "",
          roomNumber: d.data.roomNumber || "",
        });
      }
      setLoading(false);
    });
  }, [user, router]);

  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/user", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.success) {
        toast.success("资料已更新");
        setEditing(false);
        setProfile((prev) => prev ? { ...prev, ...data.data } : prev);
      } else {
        toast.error(data.error);
      }
    } catch {
      toast.error("保存失败，请检查网络");
    } finally {
      setSaving(false);
    }
  };

  if (loading || !profile) return <div className="container mx-auto px-4 py-12 text-center text-gray-400">加载中...</div>;

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold">我的</h1>

      {/* 基本信息 */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">个人信息</CardTitle>
          {!editing ? (
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>编辑</Button>
          ) : (
            <div className="space-x-2">
              <Button size="sm" onClick={handleSave} disabled={saving}>{saving ? "保存中..." : "保存"}</Button>
              <Button variant="outline" size="sm" onClick={() => setEditing(false)}>取消</Button>
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {editing ? (
            <div className="grid grid-cols-2 gap-3">
              <div><Label>昵称</Label><Input value={form.nickname} onChange={e => setForm({ ...form, nickname: e.target.value })} /></div>
              <div><Label>院系</Label><Input value={form.department} onChange={e => setForm({ ...form, department: e.target.value })} /></div>
              <div><Label>宿舍楼</Label><Input value={form.dormitory} onChange={e => setForm({ ...form, dormitory: e.target.value })} /></div>
              <div><Label>房间号</Label><Input value={form.roomNumber} onChange={e => setForm({ ...form, roomNumber: e.target.value })} /></div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div><span className="text-gray-500">昵称：</span>{profile.nickname}</div>
              <div><span className="text-gray-500">学号：</span>{profile.studentId || "未填写"}</div>
              <div><span className="text-gray-500">院系：</span>{profile.department || "未填写"}</div>
              <div><span className="text-gray-500">宿舍：</span>{profile.dormitory ? `${profile.dormitory} ${profile.roomNumber || ""}` : "未填写"}</div>
              <div><span className="text-gray-500">角色：</span>{profile.roles.map(r => ROLE_LABELS[r.role] || r.role).join("、")}</div>
              <div><span className="text-gray-500">信用分：</span><span className="font-bold text-green-600">{profile.creditScore?.score ?? 100}</span></div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 快捷入口 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Link href="/orders"><Card className="hover:shadow-md cursor-pointer text-center py-4"><CardContent><div className="text-2xl mb-1">📦</div><div className="text-sm font-medium">我的订单</div></CardContent></Card></Link>
        <Link href="/textbooks/my"><Card className="hover:shadow-md cursor-pointer text-center py-4"><CardContent><div className="text-2xl mb-1">📖</div><div className="text-sm font-medium">我的教材</div></CardContent></Card></Link>
        <Link href="/subscriptions/my"><Card className="hover:shadow-md cursor-pointer text-center py-4"><CardContent><div className="text-2xl mb-1">📋</div><div className="text-sm font-medium">我的订阅</div></CardContent></Card></Link>
        <Link href="/wallet"><Card className="hover:shadow-md cursor-pointer text-center py-4"><CardContent><div className="text-2xl mb-1">💰</div><div className="text-sm font-medium">钱包</div><div className="text-xs text-gray-400">¥{profile.wallet?.balance ?? 0}</div></CardContent></Card></Link>
        <Link href="/chats"><Card className="hover:shadow-md cursor-pointer text-center py-4"><CardContent><div className="text-2xl mb-1">💬</div><div className="text-sm font-medium">聊天</div></CardContent></Card></Link>
        <Link href="/messages"><Card className="hover:shadow-md cursor-pointer text-center py-4"><CardContent><div className="text-2xl mb-1">🔔</div><div className="text-sm font-medium">消息通知</div></CardContent></Card></Link>
        <Link href="/disputes"><Card className="hover:shadow-md cursor-pointer text-center py-4"><CardContent><div className="text-2xl mb-1">⚠️</div><div className="text-sm font-medium">投诉记录</div></CardContent></Card></Link>
      </div>

      {/* 我的发布 */}
      <Card>
        <CardHeader>
          <div className="flex gap-4 border-b">
            {(["orders", "published", "tasks"] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`pb-2 text-sm font-medium border-b-2 transition-colors ${tab === t ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500"}`}>
                {t === "orders" ? "我的订单" : t === "published" ? "发布商品" : "发布任务"}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {tab === "orders" && (
            <div className="space-y-2">
              {profile.buyerOrders.length === 0 ? <p className="text-gray-400 text-sm">暂无订单</p> :
                profile.buyerOrders.map(o => (
                  <Link key={o.id} href={`/orders/${o.id}`} className="flex items-center justify-between p-2 rounded hover:bg-gray-50">
                    <div>
                      <span className="text-sm font-medium">{o.orderNo}</span>
                      <Badge className="ml-2" variant="outline">{STATUS_LABELS[o.status] || o.status}</Badge>
                    </div>
                    <span className="text-sm text-red-600 font-bold">¥{o.totalAmount}</span>
                  </Link>
                ))
              }
            </div>
          )}
          {tab === "published" && (
            <div className="space-y-2">
              {profile.products.length === 0 ? <p className="text-gray-400 text-sm">暂无发布</p> :
                profile.products.map(p => (
                  <Link key={p.id} href={`/products/${p.id}`} className="flex items-center justify-between p-2 rounded hover:bg-gray-50">
                    <span className="text-sm">{p.title}</span>
                    <span className="text-sm text-red-600">¥{p.price}</span>
                  </Link>
                ))
              }
            </div>
          )}
          {tab === "tasks" && (
            <div className="space-y-2">
              {profile.tasks.length === 0 ? <p className="text-gray-400 text-sm">暂无任务</p> :
                profile.tasks.map(t => (
                  <Link key={t.id} href={`/tasks/${t.id}`} className="flex items-center justify-between p-2 rounded hover:bg-gray-50">
                    <span className="text-sm">{t.title}</span>
                    <span className="text-sm text-orange-600">{t.budget ? `¥${t.budget}` : "面议"}</span>
                  </Link>
                ))
              }
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
