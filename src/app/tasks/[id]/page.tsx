"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/stores/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { ChatButton } from "@/components/chat-box";

const TASK_TYPES: Record<string, string> = {
  errand: "跑腿", delivery: "代取", tutoring: "辅导",
  skill_exchange: "技能交换", repair: "维修", other: "其他",
};

const TASK_STATUS: Record<string, string> = {
  open: "待接单", bidding: "竞价中", assigned: "已接单",
  in_progress: "进行中", completed: "已完成", cancelled: "已取消",
};

export default function TaskDetailPage() {
  const params = useParams();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const [task, setTask] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [bidPrice, setBidPrice] = useState("");
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    fetch(`/api/tasks/${params.id}`)
      .then((r) => r.json())
      .then((d) => { if (d.success) setTask(d.data); setLoading(false); });
  }, [params.id]);

  const handleAccept = async () => {
    if (!user) { router.push("/login"); return; }
    const price = task?.budgetType === "negotiable" ? parseFloat(bidPrice) : undefined;
    if (task?.budgetType === "negotiable" && (!price || price <= 0)) {
      toast.error("请输入报价金额");
      return;
    }
    setAccepting(true);
    const res = await fetch(`/api/tasks/${params.id}/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(price ? { price } : {}),
    });
    const data = await res.json();
    if (data.success) {
      toast.success("接单成功！请等待发布者支付");
      router.push("/orders");
    } else {
      toast.error(data.error);
    }
    setAccepting(false);
  };

  if (loading) return <div className="container mx-auto px-4 py-12 text-center text-gray-400">加载中...</div>;
  if (!task) return <div className="container mx-auto px-4 py-12 text-center text-gray-400">任务不存在</div>;

  const isPublisher = user?.id === String(task.publisherId);
  const isOpen = task.status === "open";
  const taskStatus = TASK_STATUS[String(task.status)] || String(task.status);

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <CardTitle className="text-xl">{String(task.title)}</CardTitle>
            <div className="flex gap-2">
              <Badge>{TASK_TYPES[String(task.type)] || String(task.type)}</Badge>
              <Badge variant="outline">{taskStatus}</Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-gray-600">{String(task.description)}</p>
          <div className="text-2xl font-bold text-orange-600">
            {task.budget ? `¥${String(task.budget)}` : "面议"}
            {task.budgetType === "negotiable" && <span className="text-sm text-gray-400 ml-2">可议价</span>}
          </div>
          <div className="border-t pt-4 space-y-2 text-sm text-gray-500">
            <p>发布者：<Link href={`/user/${String(task.publisherId)}`} className="text-blue-600 hover:underline">{String((task.publisher as Record<string, unknown>)?.nickname || "")}</Link></p>
            <p>位置：{String(task.location || "未填写")}</p>
            {String(task.deadline || "") && <p>截止时间：{new Date(String(task.deadline)).toLocaleString("zh-CN")}</p>}
            <p>发布时间：{new Date(String(task.createdAt)).toLocaleDateString("zh-CN")}</p>
          </div>

          {/* 接单区域 */}
          {isOpen && !isPublisher && (
            <div className="space-y-3 border-t pt-4">
              {task.budgetType === "negotiable" && (
                <div>
                  <label className="text-sm text-gray-500 mb-1 block">您的报价</label>
                  <Input type="number" placeholder="输入金额" value={bidPrice} onChange={e => setBidPrice(e.target.value)} />
                </div>
              )}
              <Button className="w-full" size="lg" onClick={handleAccept} disabled={accepting}>
                {accepting ? "接单中..." : "接单"}
              </Button>
              <ChatButton
                receiverId={String(task.publisherId)}
                receiverName={String((task.publisher as Record<string, unknown>)?.nickname || "")}
              />
            </div>
          )}

          {/* 已接单/进行中状态提示 */}
          {task.status === "assigned" && (
            <div className="border-t pt-4 text-sm text-blue-600 bg-blue-50 p-3 rounded">
              该任务已被接单，请前往订单页面支付以启动服务。
            </div>
          )}
          {task.status === "completed" && (
            <div className="border-t pt-4 text-sm text-green-600 bg-green-50 p-3 rounded">
              该任务已完成。
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
