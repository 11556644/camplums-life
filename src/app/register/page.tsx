"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuthStore } from "@/stores/auth";

export default function RegisterPage() {
  const router = useRouter();
  const fetchUser = useAuthStore((s) => s.fetchUser);
  const [form, setForm] = useState({
    phone: "",
    password: "",
    nickname: "",
    schoolId: "school_001",
    studentId: "",
    department: "",
    dormitory: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const updateForm = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.success) {
        await fetchUser();
        router.push("/");
      } else {
        setError(data.error);
      }
    } catch {
      setError("网络错误，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">注册新账号</CardTitle>
          <CardDescription>加入校园生活服务平台</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="phone">手机号 *</Label>
              <Input id="phone" type="tel" placeholder="请输入手机号" value={form.phone} onChange={(e) => updateForm("phone", e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">密码 *</Label>
              <Input id="password" type="password" placeholder="至少6位" value={form.password} onChange={(e) => updateForm("password", e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nickname">昵称 *</Label>
              <Input id="nickname" placeholder="你的昵称" value={form.nickname} onChange={(e) => updateForm("nickname", e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="studentId">学号</Label>
              <Input id="studentId" placeholder="可选" value={form.studentId} onChange={(e) => updateForm("studentId", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="department">院系</Label>
              <Input id="department" placeholder="可选" value={form.department} onChange={(e) => updateForm("department", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dormitory">宿舍楼</Label>
              <Input id="dormitory" placeholder="如：1号楼" value={form.dormitory} onChange={(e) => updateForm("dormitory", e.target.value)} />
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "注册中..." : "注册"}
            </Button>
          </form>
          <div className="mt-4 text-center text-sm text-gray-500">
            已有账号？{" "}
            <Link href="/login" className="text-blue-600 hover:underline">
              立即登录
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
