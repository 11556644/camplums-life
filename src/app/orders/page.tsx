"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ORDER_STATUS_LABELS } from "@/lib/constants";
import { useRealtime, RealtimeEvent } from "@/hooks/use-realtime";

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

export default function OrdersPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState("buyer");
  const [payingOrderId, setPayingOrderId] = useState<string | null>(null);
  const [payMethod, setPayMethod] = useState<"wallet" | "wechat" | "alipay">("wallet");

  const refreshOrders = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const apiRole = role === "task_seller" ? "seller" : role;
    const typeFilter = role === "task_seller" ? "&orderType=task" : "";
    const res = await fetch(`/api/orders?role=${apiRole}${typeFilter}`);
    const data = await res.json();
    if (data.success) setOrders(data.data);
    if (!silent) setLoading(false);
  }, [role]);

  useEffect(() => {
    if (!user) { router.push("/login"); return; }
    refreshOrders();
  }, [refreshOrders, user, router]);

  // SSE：订单变更时静默刷新
  const handleRealtime = useCallback((event: RealtimeEvent) => {
    if (event.type === "order") refreshOrders(true);
  }, [refreshOrders]);
  useRealtime(handleRealtime, [role]);

  const handlePay = async (orderId: string, method: string) => {
    if (method === "wallet") {
      // 钱包支付
      const order = orders.find((o: Order) => o.id === orderId);
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
        refreshOrders();
      } else {
        toast.error(data.error);
      }
    } else {
      // 模拟微信/支付宝支付
      const res = await fetch(`/api/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "pay", method }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success("支付成功");
        setPayingOrderId(null);
        refreshOrders();
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
    if (data.success) {
      toast.success("已确认收货");
      refreshOrders();
    } else {
      toast.error(data.error);
    }
  };

  const handleStart = async (orderId: string) => {
    const res = await fetch(`/api/orders/${orderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "start" }),
    });
    const data = await res.json();
    if (data.success) { toast.success("已开始执行"); refreshOrders(); } else toast.error(data.error);
  };

  const handleSupplierDone = async (taskId: string, orderId: string) => {
    const res = await fetch(`/api/tasks/${taskId}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId, supplierDone: true }),
    });
    const data = await res.json();
    if (data.success) { toast.success("已标记完成，等待发布者确认"); refreshOrders(); } else toast.error(data.error);
  };

  const handleTaskComplete = async (taskId: string, orderId: string) => {
    const res = await fetch(`/api/tasks/${taskId}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId }),
    });
    const data = await res.json();
    if (data.success) { toast.success("任务已完成"); refreshOrders(); } else toast.error(data.error);
  };

  const handleShip = async (orderId: string) => {
    const res = await fetch(`/api/orders/${orderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "ship" }),
    });
    const data = await res.json();
    if (data.success) {
      toast.success("已发货");
      refreshOrders();
    } else {
      toast.error(data.error);
    }
  };

  const handleCancel = async (orderId: string) => {
    if (!confirm("确定取消此订单？")) return;
    const res = await fetch(`/api/orders/${orderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "cancel" }),
    });
    const data = await res.json();
    if (data.success) { toast.success("订单已取消"); refreshOrders(); } else toast.error(data.error);
  };

  const handleDeliver = async (orderId: string) => {
    const res = await fetch(`/api/orders/${orderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "deliver" }),
    });
    const data = await res.json();
    if (data.success) { toast.success("已确认送达"); refreshOrders(); } else toast.error(data.error);
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

      {loading ? (
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
                      {order.status === "pending_payment" && role === "buyer" && (
                        <>
                          {payingOrderId === order.id ? (
                            <div className="flex gap-2 items-center">
                              <button onClick={() => { handlePay(order.id, "wallet"); }} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-100 text-indigo-700 hover:bg-indigo-200">钱包付</button>
                              <button onClick={() => { handlePay(order.id, "wechat"); }} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-green-100 text-green-700 hover:bg-green-200">微信</button>
                              <button onClick={() => { handlePay(order.id, "alipay"); }} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-100 text-blue-700 hover:bg-blue-200">支付宝</button>
                              <button onClick={() => setPayingOrderId(null)} className="text-xs text-gray-400 ml-1">取消</button>
                            </div>
                          ) : (
                            <Button size="sm" onClick={() => setPayingOrderId(order.id)}>立即支付</Button>
                          )}
                        </>
                      )}
                      {/* 商品订单：卖家发货 */}
                      {order.status === "paid" && role === "seller" && order.orderType === "product" && (
                        <Button size="sm" onClick={() => handleShip(order.id)}>
                          {(order as unknown as Record<string, unknown>).deliveryMethod === "cabinet" ? "存入智能柜" : "发货"}
                        </Button>
                      )}
                      {/* 商品订单：卖家确认送达 */}
                      {order.status === "shipped" && role === "seller" && order.orderType === "product" && (
                        <Button size="sm" onClick={() => handleDeliver(order.id)}>确认送达</Button>
                      )}
                      {/* 任务订单：服务者开始执行 */}
                      {order.status === "paid" && role === "seller" && order.orderType === "task" && (
                        <Button size="sm" onClick={() => handleStart(order.id)}>开始执行</Button>
                      )}
                      {/* 任务订单：服务者标记完成 */}
                      {order.status === "in_progress" && role === "seller" && order.orderType === "task" && (
                        <Button size="sm" className="bg-orange-500 hover:bg-orange-600" onClick={() => {
                          const taskId = order.items[0]?.taskId;
                          if (taskId) handleSupplierDone(taskId, order.id);
                        }}>标记完成</Button>
                      )}
                      {/* 任务订单：发布者确认完成 */}
                      {order.status === "in_progress" && role === "buyer" && order.orderType === "task" && (
                        <Button size="sm" onClick={() => {
                          const taskId = order.items[0]?.taskId;
                          if (taskId) handleTaskComplete(taskId, order.id);
                        }}>确认完成</Button>
                      )}
                      {/* 商品订单：买家确认收货 */}
                      {(order.status === "delivered" || order.status === "shipped") && role === "buyer" && order.orderType === "product" && (
                        <Button size="sm" onClick={() => handleComplete(order.id)}>确认收货</Button>
                      )}
                      {/* 物流（仅商品订单） */}
                      {(order.status === "shipped" || order.status === "delivered") && order.orderType === "product" && (
                        <Button variant="outline" size="sm" onClick={() => router.push(`/logistics/${order.id}`)}>物流</Button>
                      )}
                      {/* 教材订阅：归还入口 */}
                      {order.orderType === "subscription" && ["paid", "in_progress"].includes(order.status) && (
                        <Button variant="outline" size="sm" onClick={() => router.push("/textbooks/my")}>我的教材</Button>
                      )}
                      {/* 取消订单 */}
                      {(order.status === "pending_payment" || order.status === "paid") && (
                        <Button variant="outline" size="sm" className="text-red-600 border-red-200" onClick={() => handleCancel(order.id)}>取消</Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => router.push(`/orders/${order.id}`)}>详情</Button>
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
