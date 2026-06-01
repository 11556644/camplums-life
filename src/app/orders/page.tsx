"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import { useAuthStore } from "@/stores/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ORDER_STATUS_LABELS } from "@/lib/constants";
import { useRealtime, RealtimeEvent } from "@/hooks/use-realtime";
import { OrderActionButtons } from "@/components/order-action-buttons";

const ORDER_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  product: { label: "商品", color: "bg-gray-100 text-gray-600" },
  task: { label: "任务", color: "bg-orange-100 text-orange-600" },
  subscription: { label: "教材", color: "bg-green-100 text-green-600" },
  storage: { label: "寄存", color: "bg-blue-100 text-blue-600" },
};

interface Order {
  id: string;
  orderNo: string;
  orderType: string;
  bizType: string;
  status: string;
  totalAmount: number;
  createdAt: string;
  deliveryMethod?: string;
  items: Array<{
    id: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    productId: string | null;
    taskId: string | null;
    product: { title: string } | null;
    task: { title: string } | null;
  }>;
}

interface OrdersResponse {
  success: boolean;
  data: Order[];
}

export default function OrdersPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const [role, setRole] = useState("buyer");
  const [payingOrderId, setPayingOrderId] = useState<string | null>(null);
  const [payMethod, setPayMethod] = useState<"wallet" | "wechat" | "alipay">("wallet");

  const apiRole = role === "task_seller" ? "seller" : role;
  const typeFilter = role === "task_seller" ? "&orderType=task" : "";
  const swrKey = user ? `/api/orders?role=${apiRole}${typeFilter}` : null;

  const { data: ordersRes, mutate: mutateOrders } = useSWR<OrdersResponse>(
    swrKey,
    fetcher,
    { revalidateOnFocus: false }
  );
  const orders = ordersRes?.data ?? [];
  const isLoading = user && !ordersRes;

  // SSE: order changes trigger silent revalidation
  const handleRealtime = useCallback((event: RealtimeEvent) => {
    if (event.type === "order") mutateOrders();
  }, [mutateOrders]);
  useRealtime(handleRealtime, [role]);

  const handlePay = async (orderId: string, method: string) => {
    if (method === "wallet") {
      const order = orders.find((o) => o.id === orderId);
      if (!order) return;
      const res = await fetch("/api/wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "pay", amount: order.totalAmount, orderId }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success("钱包支付成功");
        setPayingOrderId(null);
        mutateOrders();
      } else {
        toast.error(data.error);
      }
    } else {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "pay", method }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success("支付成功");
        setPayingOrderId(null);
        mutateOrders();
      } else {
        toast.error(data.error);
      }
    }
  };

  const handleComplete = async (orderId: string) => {
    const res = await fetch(`/api/orders/${orderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "complete" }),
    });
    const data = await res.json();
    if (data.success) { toast.success("已确认收货"); mutateOrders(); } else toast.error(data.error);
  };

  const handleStart = async (orderId: string) => {
    const res = await fetch(`/api/orders/${orderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "start" }),
    });
    const data = await res.json();
    if (data.success) { toast.success("已开始执行"); mutateOrders(); } else toast.error(data.error);
  };

  const handleSupplierDone = async (taskId: string, orderId: string) => {
    const res = await fetch(`/api/tasks/${taskId}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId, supplierDone: true }),
    });
    const data = await res.json();
    if (data.success) { toast.success("已标记完成，等待发布者确认"); mutateOrders(); } else toast.error(data.error);
  };

  const handleTaskComplete = async (taskId: string, orderId: string) => {
    const res = await fetch(`/api/tasks/${taskId}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId }),
    });
    const data = await res.json();
    if (data.success) { toast.success("任务已完成"); mutateOrders(); } else toast.error(data.error);
  };

  const handleShip = async (orderId: string) => {
    const res = await fetch(`/api/orders/${orderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "ship" }),
    });
    const data = await res.json();
    if (data.success) { toast.success("已发货"); mutateOrders(); } else toast.error(data.error);
  };

  const handleCancel = async (orderId: string) => {
    if (!confirm("确定取消此订单？")) return;
    const res = await fetch(`/api/orders/${orderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "cancel" }),
    });
    const data = await res.json();
    if (data.success) { toast.success("订单已取消"); mutateOrders(); } else toast.error(data.error);
  };

  const handleDeliver = async (orderId: string) => {
    const res = await fetch(`/api/orders/${orderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "deliver" }),
    });
    const data = await res.json();
    if (data.success) { toast.success("已确认送达"); mutateOrders(); } else toast.error(data.error);
  };

  if (!user) return null;

  return (
    <div className="container mx-auto px-4 py-5">
      <h1 className="text-xl font-bold mb-4">我的订单</h1>

      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setRole("buyer")}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${role === "buyer" ? "bg-blue-600 text-white" : "bg-gray-100"}`}
        >
          我买的
        </button>
        <button
          onClick={() => setRole("seller")}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${role === "seller" ? "bg-blue-600 text-white" : "bg-gray-100"}`}
        >
          我卖的
        </button>
        <button
          onClick={() => setRole("task_seller")}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${role === "task_seller" ? "bg-orange-500 text-white" : "bg-gray-100"}`}
        >
          我接的
        </button>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-gray-400">加载中...</div>
      ) : orders.length === 0 ? (
        <div className="text-center py-12 text-gray-400">暂无订单</div>
      ) : (
        <div className="space-y-3">
          {orders.map((order) => {
            const statusInfo = ORDER_STATUS_LABELS[order.status] || { label: order.status, color: "bg-gray-100" };
            const typeInfo = ORDER_TYPE_LABELS[order.orderType] || { label: order.orderType, color: "bg-gray-100" };
            return (
              <Card key={order.id}>
                <CardHeader className="pb-2 pt-3 px-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm text-gray-500">订单号：{order.orderNo}</CardTitle>
                    <div className="flex gap-1">
                      <Badge className={typeInfo.color} variant="outline">{typeInfo.label}</Badge>
                      <Badge className={statusInfo.color}>{statusInfo.label}</Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="px-4 pb-3">
                  <div className="space-y-1.5">
                    {order.items.map((item) => (
                      <div key={item.id} className="flex justify-between text-sm">
                        <span>{item.product?.title || item.task?.title || "未知商品"}</span>
                        <span>x{item.quantity} ¥{item.totalPrice}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-lg font-bold text-red-600">¥{order.totalAmount}</span>
                    <div className="flex flex-wrap gap-1.5 justify-end">
                      <OrderActionButtons
                        order={order}
                        role={role}
                        payingOrderId={payingOrderId}
                        onSetPayingOrderId={setPayingOrderId}
                        onPay={handlePay}
                        onShip={handleShip}
                        onDeliver={handleDeliver}
                        onStart={handleStart}
                        onSupplierDone={handleSupplierDone}
                        onTaskComplete={handleTaskComplete}
                        onComplete={handleComplete}
                        onCancel={handleCancel}
                        onNavigate={router.push}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
