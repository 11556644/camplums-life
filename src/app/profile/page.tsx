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
  creditScore: { score: number; tier: string; totalOrders: number } | null;
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
  const [tab, setTab] = useState<"orders" | "sellerOrders" | "published" | "tasks" | "favorites" | "productFav">("orders");
  const [favorites, setFavorites] = useState<Array<{ id: string; title: string; content: string; board: { id: string; name: string }; likeCount: number; commentCount: number; createdAt: string }>>([]);
  const [loadingFav, setLoadingFav] = useState(false);
  const [productFavs, setProductFavs] = useState<Array<{ id: string; title: string; price: number; status: string; images: string[]; isExpired: boolean; category: string }>>([]);
  const [loadingProdFav, setLoadingProdFav] = useState(false);

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

  useEffect(() => {
    if (tab !== "favorites" || favorites.length > 0) return;
    setLoadingFav(true);
    fetch("/api/forum/favorites").then(r => r.json()).then(d => {
      if (d.success) setFavorites(d.data);
      setLoadingFav(false);
    }).catch(() => setLoadingFav(false));
  }, [tab, favorites.length]);

  useEffect(() => {
    if (tab !== "productFav" || productFavs.length > 0) return;
    setLoadingProdFav(true);
    fetch("/api/products/favorites").then(r => r.json()).then(d => {
      if (d.success) setProductFavs(d.data);
      setLoadingProdFav(false);
    }).catch(() => setLoadingProdFav(false));
  }, [tab, productFavs.length]);

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
    <div className="container mx-auto px-4 py-5 max-w-3xl space-y-4">
      <h1 className="text-xl font-bold">我的</h1>

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
              <div className="flex items-center gap-2">
                <span className="text-gray-500">信用等级：</span>
                {(() => {
                  const tier = profile.creditScore?.tier || "standard";
                  const tierInfo: Record<string, { label: string; color: string }> = {
                    blacklist: { label: "黑名单", color: "text-red-600 bg-red-50" },
                    restricted: { label: "受限", color: "text-orange-500 bg-orange-50" },
                    standard: { label: "标准", color: "text-gray-600 bg-gray-50" },
                    good: { label: "良好", color: "text-blue-600 bg-blue-50" },
                    excellent: { label: "优秀", color: "text-green-600 bg-green-50" },
                  };
                  const info = tierInfo[tier] || tierInfo.standard;
                  return (
                    <>
                      <span className={`font-bold px-2 py-0.5 rounded text-sm ${info.color}`}>{info.label}</span>
                      <span className="text-sm text-gray-400">{profile.creditScore?.score ?? 600}分 · 完成{profile.creditScore?.totalOrders ?? 0}单</span>
                    </>
                  );
                })()}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 快捷入口 */}
      <div className="grid grid-cols-4 gap-2 items-stretch">
        <Link href="/orders"><Card className="hover:shadow-md cursor-pointer text-center h-full"><CardContent className="p-2 flex flex-col items-center justify-center"><div className="text-3xl mb-0.5">📦</div><div className="text-sm font-medium">订单</div></CardContent></Card></Link>
        <Link href="/textbooks/my"><Card className="hover:shadow-md cursor-pointer text-center h-full"><CardContent className="p-2 flex flex-col items-center justify-center"><div className="text-3xl mb-0.5">📖</div><div className="text-sm font-medium">借阅</div></CardContent></Card></Link>
        <Link href="/wallet"><Card className="hover:shadow-md cursor-pointer text-center h-full"><CardContent className="p-2 flex flex-col items-center justify-center"><div className="text-3xl mb-0.5">💰</div><div className="text-sm font-medium">钱包</div><div className="text-xs text-muted-foreground">¥{profile.wallet?.balance ?? 0}</div></CardContent></Card></Link>
        <Link href="/chats"><Card className="hover:shadow-md cursor-pointer text-center h-full"><CardContent className="p-2 flex flex-col items-center justify-center"><div className="text-3xl mb-0.5">💬</div><div className="text-sm font-medium">聊天</div></CardContent></Card></Link>
        <Link href="/messages"><Card className="hover:shadow-md cursor-pointer text-center h-full"><CardContent className="p-2 flex flex-col items-center justify-center"><div className="text-3xl mb-0.5">🔔</div><div className="text-sm font-medium">通知</div></CardContent></Card></Link>
        <Link href="/disputes"><Card className="hover:shadow-md cursor-pointer text-center h-full"><CardContent className="p-2 flex flex-col items-center justify-center"><div className="text-3xl mb-0.5">⚠️</div><div className="text-sm font-medium">投诉</div></CardContent></Card></Link>
        <button onClick={() => setTab("favorites")}><Card className="hover:shadow-md cursor-pointer text-center h-full"><CardContent className="p-2 flex flex-col items-center justify-center"><div className="text-3xl mb-0.5">⭐</div><div className="text-sm font-medium">帖子</div></CardContent></Card></button>
        <button onClick={() => setTab("productFav")}><Card className="hover:shadow-md cursor-pointer text-center h-full"><CardContent className="p-2 flex flex-col items-center justify-center"><div className="text-3xl mb-0.5">🛒</div><div className="text-sm font-medium">商品</div></CardContent></Card></button>
      </div>

      {/* 我的发布 */}
      <Card>
        <CardHeader>
          <div className="flex gap-4 border-b">
            {(["orders", "sellerOrders", "published", "tasks", "favorites", "productFav"] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`pb-2 text-sm font-medium border-b-2 transition-colors ${tab === t ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500"}`}>
                {t === "orders" ? "我买的" : t === "sellerOrders" ? "我卖的" : t === "published" ? "发布商品" : t === "tasks" ? "发布任务" : t === "favorites" ? "贴吧收藏" : "商品收藏"}
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
          {tab === "sellerOrders" && (
            <div className="space-y-2">
              {(!profile.sellerOrders || profile.sellerOrders.length === 0) ? <p className="text-gray-400 text-sm">暂无卖出订单</p> :
                profile.sellerOrders.map(o => (
                  <Link key={o.id} href={`/orders/${o.id}`} className="flex items-center justify-between p-2 rounded hover:bg-gray-50">
                    <div>
                      <span className="text-sm font-medium">{o.orderNo}</span>
                      <Badge className="ml-2" variant="outline">{STATUS_LABELS[o.status] || o.status}</Badge>
                    </div>
                    <span className="text-sm text-green-600 font-bold">+¥{o.totalAmount}</span>
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
          {tab === "favorites" && (
            <div className="space-y-2">
              {loadingFav ? <p className="text-gray-400 text-sm">加载中...</p> :
                favorites.length === 0 ? <p className="text-gray-400 text-sm">暂无收藏</p> :
                  favorites.map(f => (
                    <Link key={f.id} href={`/forum/${f.board?.id}/${f.id}`} className="block p-2 rounded hover:bg-gray-50">
                      <div className="flex items-center gap-2 mb-1">
                        {f.board && <span className="text-xs px-1.5 py-0.5 bg-gray-100 rounded">{f.board.name}</span>}
                        <span className="text-sm font-medium line-clamp-1">{f.title}</span>
                      </div>
                      <p className="text-xs text-gray-500 line-clamp-1">{f.content}</p>
                      <div className="flex gap-3 mt-1 text-xs text-gray-400">
                        <span>👍 {f.likeCount}</span>
                        <span>💬 {f.commentCount}</span>
                      </div>
                    </Link>
                  ))
              }
            </div>
          )}
          {tab === "productFav" && (
            <div className="space-y-2">
              {loadingProdFav ? <p className="text-gray-400 text-sm">加载中...</p> :
                productFavs.length === 0 ? <p className="text-gray-400 text-sm">暂无商品收藏</p> :
                  productFavs.map(p => (
                    <Link key={p.id} href={`/products/${p.id}`} className={`flex items-center justify-between p-2 rounded hover:bg-gray-50 ${p.isExpired ? "opacity-50" : ""}`}>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium line-clamp-1">{p.title}</span>
                        {p.isExpired && <span className="text-xs px-1.5 py-0.5 bg-red-100 text-red-600 rounded">已下架</span>}
                      </div>
                      <span className="text-sm text-red-600 font-bold">¥{p.price}</span>
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
