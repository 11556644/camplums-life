"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/stores/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { OrderChat } from "@/components/order-chat";

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending_payment: { label: "待支付", color: "bg-yellow-100 text-yellow-800" },
  paid: { label: "已支付", color: "bg-blue-100 text-blue-800" },
  shipped: { label: "已发货", color: "bg-purple-100 text-purple-800" },
  delivered: { label: "已送达", color: "bg-indigo-100 text-indigo-800" },
  in_progress: { label: "进行中", color: "bg-blue-100 text-blue-800" },
  completed: { label: "已完成", color: "bg-green-100 text-green-800" },
  cancelled: { label: "已取消", color: "bg-gray-100 text-gray-800" },
  disputed: { label: "纠纷中", color: "bg-red-100 text-red-800" },
  refunded: { label: "已退款", color: "bg-orange-100 text-orange-800" },
};

export default function OrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const [order, setOrder] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [ratingScore, setRatingScore] = useState(5);
  const [ratingContent, setRatingContent] = useState("");
  const [showDispute, setShowDispute] = useState(false);
  const [disputeReason, setDisputeReason] = useState("");
  const [disputeDesc, setDisputeDesc] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!user) { router.push("/login"); return; }
    const fetchOrder = async () => {
      const res = await fetch(`/api/orders/${params.id}`);
      const data = await res.json();
      if (data.success) setOrder(data.data);
      setLoading(false);
    };
    fetchOrder();
    const timer = setInterval(fetchOrder, 10000);
    return () => clearInterval(timer);
  }, [params.id, user, router]);

  const handleRate = async () => {
    const res = await fetch(`/api/orders/${params.id}/rate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ score: ratingScore, content: ratingContent }),
    });
    const data = await res.json();
    if (data.success) {
      toast.success("评价成功");
      const res2 = await fetch(`/api/orders/${params.id}`);
      const d2 = await res2.json();
      if (d2.success) setOrder(d2.data);
      setRatingContent("");
    } else {
      toast.error(data.error);
    }
  };

  const handleDispute = async () => {
    if (!disputeReason.trim() || !disputeDesc.trim()) {
      toast.error("请填写投诉原因和描述");
      return;
    }
    setSubmitting(true);
    const res = await fetch("/api/disputes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId: params.id, reason: disputeReason, description: disputeDesc }),
    });
    const data = await res.json();
    if (data.success) {
      toast.success("投诉已提交，管理员将尽快处理");
      setShowDispute(false);
      setDisputeReason("");
      setDisputeDesc("");
    } else {
      toast.error(data.error);
    }
    setSubmitting(false);
  };

  if (!user || loading) return <div className="container mx-auto px-4 py-12 text-center text-gray-400">加载中...</div>;
  if (!order) return <div className="container mx-auto px-4 py-12 text-center text-gray-400">订单不存在</div>;

  const statusInfo = STATUS_LABELS[(order.status as string)] || { label: order.status as string, color: "bg-gray-100" };
  const canDispute = ["paid", "shipped", "delivered", "completed", "disputed"].includes(order.status as string);
  const isBuyer = user.id === String(order.buyerId);
  const isSeller = user.id === String(order.sellerId);
  const orderType = order.orderType as string;
  const orderStatus = order.status as string;

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">订单详情</CardTitle>
            <Badge className={statusInfo.color}>{statusInfo.label}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm text-gray-500">订单号：{order.orderNo as string}</div>
          <div className="text-sm text-gray-500">类型：{order.orderType as string} / {order.bizType as string}</div>
          <div className="text-2xl font-bold text-red-600">¥{String(order.totalAmount)}</div>
          {order.paidAt ? <div className="text-sm text-gray-500">支付时间：{new Date(order.paidAt as string).toLocaleString("zh-CN")}</div> : null}
          {order.completedAt ? <div className="text-sm text-gray-500">完成时间：{new Date(order.completedAt as string).toLocaleString("zh-CN")}</div> : null}

          {/* 买家/卖家信息 */}
          <div className="border-t pt-3 space-y-1 text-sm text-gray-500">
            <p>买家：{String((order.buyer as Record<string, unknown>)?.nickname || "")}</p>
            <p>卖家：{String((order.seller as Record<string, unknown>)?.nickname || "")}</p>
          </div>

          {/* 物流（商品订单发货后） */}
          {orderType === "product" && (orderStatus === "shipped" || orderStatus === "delivered") && (
            <Link href={`/logistics/${order.id}`}>
              <Button variant="outline" className="w-full">查看物流</Button>
            </Link>
          )}

          {/* 卖家：发货（商品订单已支付） */}
          {orderType === "product" && orderStatus === "paid" && isSeller && (
            <Button className="w-full" onClick={async () => {
              const res = await fetch(`/api/orders/${params.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "ship" }) });
              const d = await res.json();
              if (d.success) { toast.success("已发货"); const r2 = await fetch(`/api/orders/${params.id}`); const d2 = await r2.json(); if (d2.success) setOrder(d2.data); } else toast.error(d.error);
            }}>发货</Button>
          )}

          {/* 接单者：开始执行（任务订单已支付） */}
          {orderType === "task" && orderStatus === "paid" && isSeller && (
            <Button className="w-full bg-orange-500 hover:bg-orange-600" onClick={async () => {
              const res = await fetch(`/api/orders/${params.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "start" }) });
              const d = await res.json();
              if (d.success) { toast.success("已开始执行"); const r2 = await fetch(`/api/orders/${params.id}`); const d2 = await r2.json(); if (d2.success) setOrder(d2.data); } else toast.error(d.error);
            }}>开始执行</Button>
          )}

          {/* 接单者：标记完成（任务订单执行中） */}
          {orderType === "task" && orderStatus === "in_progress" && isSeller && (
            <Button className="w-full bg-orange-500 hover:bg-orange-600" onClick={async () => {
              const taskId = order.items?.[0]?.taskId;
              if (!taskId) return toast.error("任务ID缺失");
              const res = await fetch(`/api/tasks/${taskId}/complete`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId: params.id, supplierDone: true }) });
              const d = await res.json();
              if (d.success) { toast.success("已标记完成"); const r2 = await fetch(`/api/orders/${params.id}`); const d2 = await r2.json(); if (d2.success) setOrder(d2.data); } else toast.error(d.error);
            }}>标记完成</Button>
          )}

          {/* 发布者：确认完成（任务订单执行中） */}
          {orderType === "task" && orderStatus === "in_progress" && isBuyer && (
            <Button className="w-full" onClick={async () => {
              const taskId = order.items?.[0]?.taskId;
              if (!taskId) return toast.error("任务ID缺失");
              const res = await fetch(`/api/tasks/${taskId}/complete`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId: params.id }) });
              const d = await res.json();
              if (d.success) { toast.success("任务已完成"); const r2 = await fetch(`/api/orders/${params.id}`); const d2 = await r2.json(); if (d2.success) setOrder(d2.data); } else toast.error(d.error);
            }}>确认完成</Button>
          )}

          {/* 买家：确认收货（商品订单已发货/已送达） */}
          {orderType === "product" && (orderStatus === "shipped" || orderStatus === "delivered") && isBuyer && (
            <Button className="w-full" onClick={async () => {
              const res = await fetch(`/api/orders/${params.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "complete" }) });
              const d = await res.json();
              if (d.success) { toast.success("已确认收货"); const r2 = await fetch(`/api/orders/${params.id}`); const d2 = await r2.json(); if (d2.success) setOrder(d2.data); } else toast.error(d.error);
            }}>确认收货</Button>
          )}

          {/* 评价 */}
          {order.status === "completed" && (
            <div className="border-t pt-4">
              <h3 className="font-medium mb-2">评价</h3>
              <div className="space-y-2">
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <button key={s} onClick={() => setRatingScore(s)}
                      className={`text-2xl ${s <= ratingScore ? "text-yellow-400" : "text-gray-300"}`}>★</button>
                  ))}
                </div>
                <Textarea placeholder="写点评价..." value={ratingContent} onChange={(e) => setRatingContent(e.target.value)} rows={3} />
                <Button onClick={handleRate}>提交评价</Button>
              </div>
            </div>
          )}

          {/* 投诉 */}
          {canDispute && (
            <div className="border-t pt-4">
              {!showDispute ? (
                <Button variant="outline" className="w-full text-red-600 border-red-200 hover:bg-red-50"
                  onClick={() => setShowDispute(true)}>
                  发起投诉
                </Button>
              ) : (
                <div className="space-y-3">
                  <h3 className="font-medium text-red-600">发起投诉</h3>
                  <Input placeholder="投诉原因（如：商品损坏、未送达、服务不符）" value={disputeReason} onChange={e => setDisputeReason(e.target.value)} />
                  <Textarea placeholder="详细描述问题..." value={disputeDesc} onChange={e => setDisputeDesc(e.target.value)} rows={3} />
                  <div className="flex gap-2">
                    <Button onClick={handleDispute} disabled={submitting} className="bg-red-600 hover:bg-red-700">
                      {submitting ? "提交中..." : "提交投诉"}
                    </Button>
                    <Button variant="outline" onClick={() => setShowDispute(false)}>取消</Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 买卖家沟通 */}
      <div className="mt-6">
        <OrderChat
          orderId={String(order.id)}
          otherUserId={user.id === String(order.buyerId) ? String(order.sellerId) : String(order.buyerId)}
          otherUserName={user.id === String(order.buyerId)
            ? String((order.seller as Record<string, unknown>)?.nickname || "卖家")
            : String((order.buyer as Record<string, unknown>)?.nickname || "买家")
          }
        />
      </div>
    </div>
  );
}
