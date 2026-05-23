"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

const TASK_TYPES = [
  { value: "errand", label: "跑腿" },
  { value: "delivery", label: "代取" },
  { value: "tutoring", label: "辅导" },
  { value: "skill_exchange", label: "技能交换" },
  { value: "repair", label: "维修" },
  { value: "other", label: "其他" },
];

export default function PublishTaskPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const [form, setForm] = useState({
    title: "",
    description: "",
    type: "errand",
    budget: "",
    budgetType: "fixed",
    location: "",
  });
  const [loading, setLoading] = useState(false);

  const updateForm = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) { router.push("/login"); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/tasks/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          budget: form.budget ? parseFloat(form.budget) : null,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success("发布成功");
        router.push("/tasks");
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
    <div className="container mx-auto px-4 py-8 max-w-lg">
      <Card>
        <CardHeader>
          <CardTitle>发布任务/服务</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>任务标题 *</Label>
              <Input value={form.title} onChange={(e) => updateForm("title", e.target.value)} required placeholder="简洁描述你的需求" />
            </div>
            <div className="space-y-2">
              <Label>类型 *</Label>
              <select value={form.type} onChange={(e) => updateForm("type", e.target.value)} className="w-full border rounded-md px-3 py-2 text-sm">
                {TASK_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <Label>预算</Label>
              <div className="flex gap-2">
                <Input type="number" value={form.budget} onChange={(e) => updateForm("budget", e.target.value)} placeholder="¥ 留空表示面议" />
                <select value={form.budgetType} onChange={(e) => updateForm("budgetType", e.target.value)} className="border rounded-md px-3 py-2 text-sm">
                  <option value="fixed">固定</option>
                  <option value="negotiable">可议</option>
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>描述 *</Label>
              <Textarea value={form.description} onChange={(e) => updateForm("description", e.target.value)} required placeholder="详细描述你的需求" rows={4} />
            </div>
            <div className="space-y-2">
              <Label>地点</Label>
              <Input value={form.location} onChange={(e) => updateForm("location", e.target.value)} placeholder="如：图书馆" />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>{loading ? "发布中..." : "发布"}</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
