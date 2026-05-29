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

interface Product {
  id: string;
  title: string;
  description: string;
  price: number;
  category: string;
  status: string;
  location: string | null;
  images: string | null;
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

  useEffect(() => {
    fetch(`/api/products/${params.id}`)
      .then((r) => r.json())
      .then((d) => { if (d.success) setProduct(d.data); setLoading(false); });
    if (user) {
      fetch(`/api/products/favorites`)
        .then((r) => r.json())
        .then((d) => { if (d.success) setFavorited(d.data.some((f: { id: string }) => f.id === params.id)); });
    }
  }, [params.id, user]);

  const handleOrder = async () => {
    if (!user) { router.push("/login"); return; }
    setOrdering(true);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: params.id }),
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
          {product.status === "active" && user?.id !== product.seller.id && (
            <div className="space-y-2">
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
