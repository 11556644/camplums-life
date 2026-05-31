"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PhotoUpload } from "@/components/photo-upload";
import { toast } from "sonner";

const CATEGORIES = [
  { value: "electronics", label: "数码" },
  { value: "clothing", label: "服饰" },
  { value: "books", label: "图书" },
  { value: "furniture", label: "家具" },
  { value: "daily", label: "日用" },
  { value: "other", label: "其他" },
];

export default function PublishProductPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const [form, setForm] = useState({
    title: "",
    description: "",
    price: "",
    category: "other",
    location: "",
    cabinetDelivery: false,
    faceToFaceDelivery: true,
  });
  const [photos, setPhotos] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const updateForm = (field: string, value: string) => setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) { router.push("/login"); return; }
    if (!form.cabinetDelivery && !form.faceToFaceDelivery) { toast.error("请至少选择一种交收方式"); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/products/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, price: parseFloat(form.price), images: photos }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success("发布成功");
        router.push("/products");
      } else {
        toast.error(data.error);
      }
    } catch {
      toast.error("发布失败");
    } finally {
      setLoading(false);
    }
  };

  if (!user) return <div className="container mx-auto px-4 py-12 text-center"><Button onClick={() => router.push("/login")}>请先登录</Button></div>;

  return (
    <div className="container mx-auto px-4 py-5 max-w-lg">
      <Card>
        <CardHeader>
          <CardTitle>发布闲置商品</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>商品名称 *</Label>
              <Input value={form.title} onChange={(e) => updateForm("title", e.target.value)} required placeholder="简洁描述你的商品" />
            </div>
            <div className="space-y-2">
              <Label>分类 *</Label>
              <select value={form.category} onChange={(e) => updateForm("category", e.target.value)} className="w-full border rounded-md px-3 py-2 text-sm">
                {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <Label>价格 *</Label>
              <Input type="number" step="0.01" value={form.price} onChange={(e) => updateForm("price", e.target.value)} required placeholder="¥" />
            </div>
            <div className="space-y-2">
              <Label>商品照片</Label>
              <PhotoUpload photos={photos} onChange={setPhotos} />
            </div>
            <div className="space-y-2">
              <Label>描述</Label>
              <Textarea value={form.description} onChange={(e) => updateForm("description", e.target.value)} placeholder="成色、使用时长、配件等" rows={4} />
            </div>
            <div className="space-y-2">
              <Label>位置</Label>
              <Input value={form.location} onChange={(e) => updateForm("location", e.target.value)} placeholder="如：1号楼" />
            </div>
            <div className="space-y-2">
              <Label>交收方式 *（至少选一种）</Label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.cabinetDelivery}
                    onChange={(e) => setForm(prev => ({ ...prev, cabinetDelivery: e.target.checked }))}
                    className="w-4 h-4" />
                  <span className="text-sm">📦 智能柜交收</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.faceToFaceDelivery}
                    onChange={(e) => setForm(prev => ({ ...prev, faceToFaceDelivery: e.target.checked }))}
                    className="w-4 h-4" />
                  <span className="text-sm">🤝 面对面交易</span>
                </label>
              </div>
              {!form.cabinetDelivery && !form.faceToFaceDelivery && (
                <p className="text-xs text-red-500">请至少选择一种交收方式</p>
              )}
            </div>
            <Button type="submit" className="w-full" disabled={loading || (!form.cabinetDelivery && !form.faceToFaceDelivery)}>{loading ? "发布中..." : "发布"}</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
