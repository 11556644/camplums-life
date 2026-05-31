"use client";

import { Suspense } from "react";
import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PhotoUpload } from "@/components/photo-upload";
import { useAuthStore } from "@/stores/auth";
import { toast } from "sonner";
import { Send, ArrowLeft } from "lucide-react";
import Link from "next/link";

interface Board {
  id: string;
  name: string;
  icon: string;
}

function CreatePostForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const user = useAuthStore((s) => s.user);

  const [boards, setBoards] = useState<Board[]>([]);
  const [boardId, setBoardId] = useState(searchParams.get("boardId") || "");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [loadingBoards, setLoadingBoards] = useState(true);

  useEffect(() => {
    fetch("/api/forum/boards")
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setBoards(d.data);
        setLoadingBoards(false);
      })
      .catch(() => setLoadingBoards(false));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) {
      toast.error("请先登录");
      router.push("/login");
      return;
    }
    if (!boardId) {
      toast.error("请选择版块");
      return;
    }
    if (!title.trim()) {
      toast.error("请输入标题");
      return;
    }
    if (!content.trim()) {
      toast.error("请输入内容");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/forum/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          boardId,
          title: title.trim(),
          content: content.trim(),
          images: images.length > 0 ? images : undefined,
          isAnonymous,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success("发帖成功");
        router.push(`/forum/${boardId}/${data.data.id}`);
      } else {
        toast.error(data.error || "发帖失败");
      }
    } catch {
      toast.error("发帖失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-5 max-w-2xl">
      <Link
        href="/forum"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        返回贴吧
      </Link>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">发布新帖</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">选择版块</label>
              {loadingBoards ? (
                <div className="h-10 bg-gray-200 rounded animate-pulse" />
              ) : (
                <select
                  value={boardId}
                  onChange={(e) => setBoardId(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg border border-input bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring"
                >
                  <option value="">请选择版块</option>
                  {boards.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.icon} {b.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">标题</label>
              <Input
                placeholder="请输入帖子标题"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={100}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">内容</label>
              <Textarea
                placeholder="请输入帖子内容..."
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="min-h-[200px]"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">图片（可选）</label>
              <PhotoUpload
                photos={images}
                onChange={setImages}
                maxPhotos={9}
              />
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isAnonymous}
                onChange={(e) => setIsAnonymous(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300"
              />
              <span className="text-sm">匿名发布</span>
              <span className="text-xs text-gray-400">
                （勾选后不会显示你的昵称和头像）
              </span>
            </label>

            <Button
              type="submit"
              className="w-full"
              size="lg"
              disabled={submitting}
            >
              <Send className="w-4 h-4 mr-2" />
              {submitting ? "发布中..." : "发布帖子"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default function CreatePostPage() {
  return (
    <Suspense fallback={<div className="container mx-auto px-4 py-12 text-center text-gray-400">加载中...</div>}>
      <CreatePostForm />
    </Suspense>
  );
}
