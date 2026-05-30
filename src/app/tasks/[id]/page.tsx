"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/stores/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ChatButton } from "@/components/chat-box";

const TASK_TYPES: Record<string, string> = {
  errand: "跑腿", delivery: "代取", tutoring: "辅导",
  skill_exchange: "技能交换", repair: "维修", other: "其他",
};

const TASK_STATUS: Record<string, { label: string; color: string }> = {
  open: { label: "待接单", color: "bg-green-100 text-green-800" },
  assigned: { label: "已接单", color: "bg-blue-100 text-blue-800" },
  in_progress: { label: "进行中", color: "bg-yellow-100 text-yellow-800" },
  completed: { label: "已完成", color: "bg-gray-100 text-gray-600" },
  cancelled: { label: "已取消", color: "bg-red-100 text-red-800" },
  expired: { label: "已过期", color: "bg-gray-100 text-gray-400" },
};

const ORDER_STATUS: Record<string, { label: string; color: string }> = {
  pending_payment: { label: "待支付", color: "bg-yellow-100 text-yellow-800" },
  paid: { label: "已支付", color: "bg-blue-100 text-blue-800" },
  in_progress: { label: "执行中", color: "bg-blue-100 text-blue-800" },
  completed: { label: "已完成", color: "bg-green-100 text-green-800" },
  cancelled: { label: "已取消", color: "bg-gray-100 text-gray-600" },
};

const TASK_EXEC_LIMITS: Record<string, string> = {
  errand: "2小时", delivery: "1小时", tutoring: "2小时",
  skill_exchange: "2小时", repair: "4小时", other: "2小时",
};

interface TaskDetail {
  id: string;
  title: string;
  description: string;
  type: string;
  status: string;
  budget: number | null;
  budgetType: string;
  publisherId: string;
  assigneeId: string | null;
  location: string | null;
  deadline: string | null;
  acceptedAt: string | null;
  executionDeadline: string | null;
  supplierDoneAt: string | null;
  createdAt: string;
  publisher: { id: string; nickname: string; dormitory: string | null; department: string | null };
  assignee: { id: string; nickname: string } | null;
  order: { id: string; orderNo: string; status: string; totalAmount: number; createdAt: string; paidAt: string | null; buyerId: string; sellerId: string } | null;
}

export default function TaskDetailPage() {
  const params = useParams();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchTask = async () => {
    const res = await fetch(`/api/tasks/${params.id}`);
    const d = await res.json();
    if (d.success) setTask(d.data);
    setLoading(false);
  };

  useEffect(() => { fetchTask(); }, [params.id]);

  const handleAccept = async () => {
    if (!user) { router.push("/login"); return; }
    setAccepting(true);
    const res = await fetch(`/api/tasks/${params.id}/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    const data = await res.json();
    if (data.success) {
      toast.success("接单成功！");
      fetchTask();
    } else {
      toast.error(data.error);
    }
    setAccepting(false);
  };

  const handlePay = async () => {
    if (!task?.order) return;
    setActionLoading(true);
    const res = await fetch(`/api/orders/${task.order.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "pay" }),
    });
    const data = await res.json();
    if (data.success) { toast.success("支付成功，等待接单者开始执行"); fetchTask(); } else toast.error(data.error);
    setActionLoading(false);
  };

  const handleCancelTask = async () => {
    if (!task?.order) return;
    if (!confirm("确定取消此任务？预付金额将全额退还到钱包。")) return;
    setActionLoading(true);
    const res = await fetch(`/api/orders/${task.order.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "cancel" }),
    });
    const data = await res.json();
    if (data.success) { toast.success("任务已取消，预付款已退还"); fetchTask(); } else toast.error(data.error);
    setActionLoading(false);
  };

  const handleStart = async () => {
    if (!task?.order) return;
    setActionLoading(true);
    const res = await fetch(`/api/orders/${task.order.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "start" }),
    });
    const data = await res.json();
    if (data.success) { toast.success("已开始执行"); fetchTask(); } else toast.error(data.error);
    setActionLoading(false);
  };

  const handleSupplierDone = async () => {
    if (!task?.order) return;
    setActionLoading(true);
    const res = await fetch(`/api/tasks/${params.id}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId: task.order.id, supplierDone: true }),
    });
    const data = await res.json();
    if (data.success) { toast.success("已标记完成，等待发布者确认"); fetchTask(); } else toast.error(data.error);
    setActionLoading(false);
  };

  const handleConfirm = async () => {
    if (!task?.order) return;
    setActionLoading(true);
    const res = await fetch(`/api/tasks/${params.id}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId: task.order.id }),
    });
    const data = await res.json();
    if (data.success) { toast.success("任务已完成"); fetchTask(); } else toast.error(data.error);
    setActionLoading(false);
  };

  if (loading) return <div className="container mx-auto px-4 py-12 text-center text-gray-400">加载中...</div>;
  if (!task) return <div className="container mx-auto px-4 py-12 text-center text-gray-400">任务不存在</div>;

  const isPublisher = user?.id === task.publisherId;
  const isAssignee = user?.id === task.assigneeId;
  const isParticipant = isPublisher || isAssignee;
  const ts = TASK_STATUS[task.status] || { label: task.status, color: "bg-gray-100" };
  const order = task.order;
  const orderStatus = order?.status ?? "";
  const os = order ? ORDER_STATUS[orderStatus] || { label: orderStatus, color: "bg-gray-100" } : null;
  const supplierDone = Boolean(task.supplierDoneAt);

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      {/* 任务信息 */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <CardTitle className="text-xl">{task.title}</CardTitle>
            <div className="flex gap-2">
              <Badge>{TASK_TYPES[task.type] || task.type}</Badge>
              <Badge className={ts.color}>{ts.label}</Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-gray-600">{task.description}</p>
          <div className="text-2xl font-bold text-orange-600">
            {task.budget ? `¥${String(task.budget)}` : "面议"}
            {task.budgetType === "negotiable" && <span className="text-sm text-gray-400 ml-2">可议价</span>}
          </div>
          <div className="border-t pt-4 space-y-2 text-sm text-gray-500">
            <p>发布者：<Link href={`/user/${task.publisherId}`} className="text-blue-600 hover:underline">{String(task.publisher?.nickname || "")}</Link></p>
            {task.assigneeId ? (
              isAssignee ? (
                <p>接单人：<span className="text-green-600 font-medium">你</span></p>
              ) : (
                <p>接单人：<Link href={`/user/${task.assigneeId}`} className="text-blue-600 hover:underline">{String(task.assignee?.nickname || "")}</Link></p>
              )
            ) : (
              <p>接单人：<span className="text-gray-400">等待接单</span></p>
            )}
            <p>位置：{(task.location || "未填写")}</p>
            {(task.deadline || "") && <p>截止时间：{new Date(String(task.deadline)).toLocaleString("zh-CN")}</p>}
            <p>执行时限：{TASK_EXEC_LIMITS[task.type] || "2小时"}</p>
            {task.executionDeadline && (
              <p>执行截止：<span className={new Date(task.executionDeadline) < new Date() ? "text-red-600 font-medium" : "text-orange-600"}>
                {new Date(task.executionDeadline).toLocaleString("zh-CN")}
                {new Date(task.executionDeadline) < new Date() ? "（已超时）" : ""}
              </span></p>
            )}
            {task.acceptedAt && <p>接单时间：{new Date(task.acceptedAt).toLocaleString("zh-CN")}</p>}
            <p>发布时间：{new Date(task.createdAt).toLocaleString("zh-CN")}</p>
          </div>
        </CardContent>
      </Card>

      {/* 订单状态（已接单后显示） — 接单者在 assigned+pending_payment 时不显示，避免误以为需要自己付款 */}
      {order && task.assigneeId && !(String(task.status) === "assigned" && isAssignee && orderStatus === "pending_payment") && (
        <Card className="mt-4">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">订单信息</CardTitle>
              <div className="flex gap-1">
                {/* 接单者在 assigned 状态不展示订单状态徽章（预付订单已 paid，遗留订单的待支付是发布者的事） */}
                {os && !(String(task.status) === "assigned" && isAssignee) && <Badge className={os.color}>{os.label}</Badge>}
                <Link href={`/orders/${order.id}`}>
                  <Button variant="ghost" size="sm">订单详情</Button>
                </Link>
              </div>
            </div>
          </CardHeader>
          <CardContent className="text-sm text-gray-500 space-y-1">
            <p>订单号：{order.orderNo}</p>
            <p>金额：¥{order.totalAmount}</p>
            {order.paidAt && <p>支付时间：{new Date(order.paidAt).toLocaleString("zh-CN")}</p>}
          </CardContent>
        </Card>
      )}

      {/* 操作区域 */}
      <div className="mt-4 space-y-3">
        {/* 接单（开放状态 + 非发布者 + 已登录） */}
        {String(task.status) === "open" && !isPublisher && user && (
          <Card>
            <CardContent className="pt-4">
              <p className="text-sm text-gray-600 mb-3">任务已预付 ¥{task.budget}，接单后即可开始执行。</p>
              <Button className="w-full" size="lg" onClick={handleAccept} disabled={accepting}>
                {accepting ? "接单中..." : "接单"}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* 已接单：等待 / 支付 / 开始执行 */}
        {String(task.status) === "assigned" && (
          <>
            {isPublisher && (
              <Card>
                <CardContent className="pt-4 space-y-2">
                  {orderStatus === "pending_payment" ? (
                    <>
                      <p className="text-sm text-gray-600">接单者已接单，请完成支付以启动任务。</p>
                      <Button className="w-full bg-orange-500 hover:bg-orange-600" onClick={handlePay} disabled={actionLoading}>
                        立即支付 ¥{order?.totalAmount || task.budget}
                      </Button>
                    </>
                  ) : (
                    <p className="text-sm text-gray-500">接单者已接单，等待开始执行。</p>
                  )}
                </CardContent>
              </Card>
            )}
            {isAssignee && (
              <Card>
                <CardContent className="pt-4">
                  {orderStatus === "paid" ? (
                    <>
                      <p className="text-sm text-gray-600 mb-3">发布者已支付，请开始执行任务。</p>
                      <Button className="w-full bg-orange-500 hover:bg-orange-600" onClick={handleStart} disabled={actionLoading}>
                        开始执行
                      </Button>
                    </>
                  ) : (
                    <p className="text-sm text-gray-500">任务已接单，等待发布者确认后即可开始执行。</p>
                  )}
                </CardContent>
              </Card>
            )}
          </>
        )}

        {/* 进行中：标记完成 / 确认验收 */}
        {String(task.status) === "in_progress" && (
          <>
            {isAssignee && (
              <Card>
                <CardContent className="pt-4">
                  <p className="text-sm text-gray-600 mb-3">任务执行中，完成后请标记。</p>
                  {!supplierDone ? (
                    <Button className="w-full bg-orange-500 hover:bg-orange-600" onClick={handleSupplierDone} disabled={actionLoading}>
                      标记完成
                    </Button>
                  ) : (
                    <div className="bg-yellow-50 border border-yellow-200 rounded p-3 text-sm text-yellow-800">
                      已标记完成，等待发布者确认验收。
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {isPublisher && (
              <Card>
                <CardContent className="pt-4">
                  {supplierDone ? (
                    <>
                      <p className="text-sm text-green-600 mb-3">服务方已标记完成，请确认验收。</p>
                      <Button className="w-full" onClick={handleConfirm} disabled={actionLoading}>确认验收完成</Button>
                    </>
                  ) : (
                    <p className="text-sm text-gray-500">服务方正在执行中，请等待完成。</p>
                  )}
                </CardContent>
              </Card>
            )}
          </>
        )}

        {/* 发布者：取消任务（未接单 或 已接单但未支付） */}
        {isPublisher && (
          (String(task.status) === "open") ||
          (String(task.status) === "assigned" && (!order || orderStatus === "pending_payment"))
        ) && (
          <Card>
            <CardContent className="pt-4 space-y-2">
              <p className="text-sm text-gray-600">
                {String(task.status) === "open"
                  ? "任务已预付，正在等待接单。取消可全额退款。"
                  : "取消任务将退款并释放。"}
              </p>
              <Button variant="outline" className="w-full text-red-600 border-red-200 hover:bg-red-50"
                onClick={handleCancelTask} disabled={actionLoading}>
                取消任务并退款
              </Button>
            </CardContent>
          </Card>
        )}

        {/* 已完成 */}
        {String(task.status) === "completed" && (
          <Card className="bg-green-50 border-green-200">
            <CardContent className="pt-4 text-center text-green-700 space-y-3">
              <p>任务已完成。</p>
              {task.order && (
                <div className="flex gap-2 justify-center">
                  <Link href={`/orders/${task.order.id}`}>
                    <Button variant="outline" size="sm">查看订单 / 评价</Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* 已取消 */}
        {String(task.status) === "cancelled" && (
          <Card className="bg-red-50 border-red-200">
            <CardContent className="pt-4 text-center text-red-700">
              任务已取消。
            </CardContent>
          </Card>
        )}

        {/* 沟通（参与者可见） */}
        {isParticipant && task.assigneeId && (
          <Card>
            <CardContent className="pt-4">
              <ChatButton
                receiverId={isPublisher ? String(task.assigneeId) : task.publisherId}
                receiverName={isPublisher
                  ? String((task.assignee as Record<string, unknown>)?.nickname || "接单人")
                  : String(task.publisher?.nickname || "发布者")
                }
              />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
