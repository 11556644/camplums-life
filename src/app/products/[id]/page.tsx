"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuthStore } from "@/stores/auth";
import { toast } from "sonner";
import { ChatButton } from "@/components/chat-box";

const TRADE_DURATION_OPTIONS = [
  { minutes: 30, label: "30分钟", sellerPays: 0, buyerPays: 0, description: "免费" },
  { minutes: 120, label: "2小时", sellerPays: 0.2, buyerPays: 0, description: "特价 ¥0.2" },
  { minutes: 360, label: "6小时", sellerPays: 0.2, buyerPays: 0.8, description: "共 ¥1" },
  { minutes: 720, label: "12小时", sellerPays: 0.2, buyerPays: 1.3, description: "共 ¥1.5" },
  { minutes: 1440, label: "24小时", sellerPays: 0.2, buyerPays: 1.8, description: "共 ¥2" },
];

interface Product {
  id: string;
  title: string;
  description: string;
  price: number;
  category: string;
  status: string;
  location: string | null;
  images: string | null;
  cabinetDelivery: boolean;
  faceToFaceDelivery: boolean;
  seller: { id: string; nickname: string; dormitory: string | null; department: string | null; createdAt: string };
  createdAt: string;
}

const CATEGORIES: Record<string, string> = {
  electronics: "数码", clothing: "服饰", books: "图书",
  furniture: "家具", daily: "日用", other: "其他",
};

export default function ProductDetailPage() {
  const params = useParams();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [ordering, setOrdering] = useState(false);
  const [activePhoto, setActivePhoto] = useState(0);
  const [favorited, setFavorited] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [deliveryMethod, setDeliveryMethod] = useState<string>("");
  const [cabinetSlotId, setCabinetSlotId] = useState("");
  const [cabinetDuration, setCabinetDuration] = useState(120); // 默认 2 小时
  const [cabinets, setCabinets] = useState<Array<{ id: string; name: string; location: string; slots: Array<{ id: string; slotNumber: number; status: string }> }>>([]);

  useEffect(() => {
    fetch(`/api/products/${params.id}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setProduct(d.data);
          // 默认选中第一个可用交收方式
          if (d.data.faceToFaceDelivery) setDeliveryMethod("face_to_face");
          else if (d.data.cabinetDelivery) setDeliveryMethod("cabinet");
        }
        setLoading(false);
      });
    if (user) {
      fetch(`/api/products/favorites`)
        .then((r) => r.json())
        .then((d) => { if (d.success) setFavorited(d.data.some((f: { id: string }) => f.id === params.id)); });
    }
  }, [params.id, user]);

  // 加载柜格（仅在选择智能柜时加载）
  useEffect(() => {
    if (deliveryMethod === "cabinet") {
      fetch("/api/cabinets").then(r => r.json()).then(d => { if (d.success) setCabinets(d.data); });
    }
  }, [deliveryMethod]);

  const handleOrder = async () => {
    if (!user) { router.push("/login"); return; }
    if (!deliveryMethod) { toast.error("请选择交收方式"); return; }
    if (deliveryMethod === "cabinet" && !cabinetSlotId) { toast.error("请选择柜格"); return; }
    setOrdering(true);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: params.id,
          deliveryMethod,
          ...(deliveryMethod === "cabinet" ? { cabinetSlotId, cabinetDuration } : {}),
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success("下单成功，请前往订单页面支付");
        router.push("/orders");
      } else {
        toast.error(data.error);
      }
    } catch {
      toast.error("下单失败");
    } finally {
      setOrdering(false);
    }
  };

  const toggleFavorite = async () => {
    if (!user) { router.push("/login"); return; }
    const res = await fetch(`/api/products/${params.id}/favorite`, { method: "POST" });
    const data = await res.json();
    if (data.success) {
      setFavorited(data.data.favorited);
      toast.success(data.data.favorited ? "已收藏" : "已取消收藏");
    }
  };

  if (loading) return <div className="container mx-auto px-4 py-12 text-center text-gray-400">加载中...</div>;
  if (!product) return <div className="container mx-auto px-4 py-12 text-center text-gray-400">商品不存在</div>;

  let photos: string[] = [];
  if (product.images) {
    try { photos = JSON.parse(product.images); } catch { photos = []; }
  }

  const isSeller = user?.id === product.seller.id;

  const handleDelist = async (action: "delist" | "relist") => {
    setActionLoading(true);
    const res = await fetch(`/api/products/${params.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const data = await res.json();
    if (data.success) {
      toast.success(action === "delist" ? "已下架" : "已重新上架");
      const r2 = await fetch(`/api/products/${params.id}`);
      const d2 = await r2.json();
      if (d2.success) setProduct(d2.data);
    } else toast.error(data.error);
    setActionLoading(false);
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <CardTitle className="text-xl">{product.title}</CardTitle>
            <Badge>{CATEGORIES[product.category] || product.category}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 照片轮播 */}
          {photos.length > 0 && (
            <div className="space-y-2">
              <img
                src={photos[activePhoto]}
                alt={product.title}
                className="w-full max-h-96 object-contain rounded-lg border bg-gray-50"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
              {photos.length > 1 && (
                <div className="flex gap-2 overflow-x-auto">
                  {photos.map((url, i) => (
                    <button
                      key={i}
                      onClick={() => setActivePhoto(i)}
                      className={`shrink-0 w-16 h-16 rounded border-2 overflow-hidden ${i === activePhoto ? "border-blue-500" : "border-gray-200"}`}
                    >
                      <img src={url} alt={`照片 ${i + 1}`} className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="text-3xl font-bold text-red-600">¥{product.price}</div>
          <p className="text-gray-600">{product.description}</p>
          <div className="border-t pt-4 space-y-2 text-sm text-gray-500">
            <p>卖家：<Link href={`/user/${product.seller.id}`} className="text-blue-600 hover:underline">{product.seller.nickname}</Link></p>
            <p>院系：{product.seller.department || "未填写"}</p>
            <p>位置：{product.location || product.seller.dormitory || "未填写"}</p>
            <p>发布时间：{new Date(product.createdAt).toLocaleDateString("zh-CN")}</p>
          </div>
          {/* 卖家操作 */}
          {isSeller && product.status === "active" && (
            <Button variant="outline" className="w-full text-red-600 border-red-200 hover:bg-red-50"
              onClick={() => handleDelist("delist")} disabled={actionLoading}>
              下架商品
            </Button>
          )}
          {isSeller && product.status === "delisted" && (
            <Button variant="outline" className="w-full text-green-600 border-green-200 hover:bg-green-50"
              onClick={() => handleDelist("relist")} disabled={actionLoading}>
              重新上架
            </Button>
          )}

          {/* 交收方式展示 */}
          <div className="border-t pt-3 text-sm text-gray-500">
            <p className="font-medium text-gray-700 mb-1">支持交收方式</p>
            <div className="flex gap-2">
              {product.cabinetDelivery && <Badge className="bg-blue-100 text-blue-800">📦 智能柜</Badge>}
              {product.faceToFaceDelivery && <Badge className="bg-green-100 text-green-800">🤝 面对面</Badge>}
            </div>
          </div>

          {/* 买家操作 */}
          {product.status === "active" && !isSeller && (
            <div className="space-y-3">
              {/* 交收方式选择 */}
              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-700">选择交收方式</p>
                <div className="flex gap-2">
                  {product.faceToFaceDelivery && (
                    <button onClick={() => setDeliveryMethod("face_to_face")}
                      className={`flex-1 px-3 py-2 rounded-lg border text-sm ${deliveryMethod === "face_to_face" ? "border-green-500 bg-green-50 text-green-700" : "border-gray-200 text-gray-600"}`}>
                      🤝 面对面交易
                    </button>
                  )}
                  {product.cabinetDelivery && (
                    <button onClick={() => setDeliveryMethod("cabinet")}
                      className={`flex-1 px-3 py-2 rounded-lg border text-sm ${deliveryMethod === "cabinet" ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-600"}`}>
                      📦 智能柜自取
                    </button>
                  )}
                </div>
              </div>

              {/* 柜格选择（仅智能柜模式） */}
              {deliveryMethod === "cabinet" && (() => {
                const emptySlots = cabinets.flatMap((c) =>
                  c.slots.filter((s) => s.status === "empty").map((s) => ({ ...s, cabinetName: c.name, cabinetLocation: c.location }))
                );
                const selectedOpt = TRADE_DURATION_OPTIONS.find(o => o.minutes === cabinetDuration);
                return (
                  <div className="space-y-2 bg-blue-50 rounded-lg p-3">
                    <p className="text-sm font-medium text-blue-800">📦 智能柜设置</p>

                    {/* 时长选择 */}
                    <div className="space-y-1">
                      <p className="text-xs text-gray-600">寄存时长</p>
                      <div className="flex flex-wrap gap-1.5">
                        {TRADE_DURATION_OPTIONS.map((opt) => (
                          <button key={opt.minutes} onClick={() => setCabinetDuration(opt.minutes)}
                            className={`px-2.5 py-1 rounded text-xs border ${cabinetDuration === opt.minutes ? "border-blue-500 bg-blue-100 text-blue-700 font-medium" : "border-gray-200 text-gray-600"}`}>
                            {opt.label}
                            {opt.buyerPays > 0 && <span className="ml-1 text-orange-500">+¥{opt.buyerPays}</span>}
                            {opt.sellerPays === 0 && opt.buyerPays === 0 && <span className="ml-1 text-green-500">免费</span>}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* 费用说明 */}
                    <div className="text-xs text-gray-500 space-y-0.5">
                      {selectedOpt && selectedOpt.sellerPays > 0 && <p>卖家承担：¥{selectedOpt.sellerPays}</p>}
                      {selectedOpt && selectedOpt.buyerPays > 0 && <p className="text-orange-600">您需补差价：¥{selectedOpt.buyerPays}（随订单支付）</p>}
                      {selectedOpt && selectedOpt.sellerPays === 0 && selectedOpt.buyerPays === 0 && <p className="text-green-600">免费寄存，无需额外费用</p>}
                      <p className="text-gray-400">超时按 ¥0.5/小时 计费，封顶 ¥10</p>
                    </div>

                    {/* 柜格选择 */}
                    <div className="space-y-1">
                      <p className="text-xs text-gray-600">选择柜格</p>
                      <select value={cabinetSlotId} onChange={(e) => setCabinetSlotId(e.target.value)}
                        className="w-full border rounded-md px-3 py-2 text-sm bg-white">
                        <option value="">请选择柜格</option>
                        {emptySlots.map((s) => (
                          <option key={s.id} value={s.id}>{s.cabinetName} #{s.slotNumber}（{s.cabinetLocation}）</option>
                        ))}
                      </select>
                      {emptySlots.length === 0 && <p className="text-xs text-orange-500">暂无可用柜格</p>}
                    </div>
                  </div>
                );
              })()}

              <div className="flex gap-2">
                <Button className="flex-1" size="lg" onClick={handleOrder} disabled={ordering}>
                  {ordering ? "下单中..." : "立即购买"}
                </Button>
                <Button size="lg" variant="outline" onClick={toggleFavorite}>
                  {favorited ? "❤️ 已收藏" : "🤍 收藏"}
                </Button>
              </div>
              <ChatButton
                receiverId={product.seller.id}
                receiverName={product.seller.nickname}
                productId={product.id}
              />
            </div>
          )}
          {product.status !== "active" && (
            <div className="text-center text-gray-400 py-2">该商品已下架</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
