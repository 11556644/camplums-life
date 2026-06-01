"use client";

import { Button } from "@/components/ui/button";

interface OrderItem {
  id: string;
  taskId: string | null;
}

interface Order {
  id: string;
  status: string;
  orderType: string;
  items: OrderItem[];
}

interface OrderActionButtonsProps {
  order: Order;
  role: string;
  payingOrderId: string | null;
  onSetPayingOrderId: (id: string | null) => void;
  onPay: (orderId: string, method: string) => void;
  onShip: (orderId: string) => void;
  onDeliver: (orderId: string) => void;
  onStart: (orderId: string) => void;
  onSupplierDone: (taskId: string, orderId: string) => void;
  onTaskComplete: (taskId: string, orderId: string) => void;
  onComplete: (orderId: string) => void;
  onCancel: (orderId: string) => void;
  onNavigate: (path: string) => void;
}

export function OrderActionButtons({
  order,
  role,
  payingOrderId,
  onSetPayingOrderId,
  onPay,
  onShip,
  onDeliver,
  onStart,
  onSupplierDone,
  onTaskComplete,
  onComplete,
  onCancel,
  onNavigate,
}: OrderActionButtonsProps) {
  return (
    <>
      {order.status === "pending_payment" && role === "buyer" && (
        <>
          {payingOrderId === order.id ? (
            <div className="flex gap-2 items-center">
              <button onClick={() => onPay(order.id, "wallet")} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-100 text-indigo-700 hover:bg-indigo-200">钱包付</button>
              <button onClick={() => onPay(order.id, "wechat")} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-green-100 text-green-700 hover:bg-green-200">微信</button>
              <button onClick={() => onPay(order.id, "alipay")} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-100 text-blue-700 hover:bg-blue-200">支付宝</button>
              <button onClick={() => onSetPayingOrderId(null)} className="text-xs text-gray-400 ml-1">取消</button>
            </div>
          ) : (
            <Button size="sm" onClick={() => onSetPayingOrderId(order.id)}>立即支付</Button>
          )}
        </>
      )}
      {order.status === "paid" && role === "seller" && order.orderType === "product" && (
        <Button size="sm" onClick={() => onShip(order.id)}>
          {(order as unknown as Record<string, unknown>).deliveryMethod === "cabinet" ? "存入智能柜" : "发货"}
        </Button>
      )}
      {order.status === "shipped" && role === "seller" && order.orderType === "product" && (
        <Button size="sm" onClick={() => onDeliver(order.id)}>确认送达</Button>
      )}
      {order.status === "paid" && role === "seller" && order.orderType === "task" && (
        <Button size="sm" onClick={() => onStart(order.id)}>开始执行</Button>
      )}
      {order.status === "in_progress" && role === "seller" && order.orderType === "task" && (
        <Button size="sm" className="bg-orange-500 hover:bg-orange-600" onClick={() => {
          const taskId = order.items[0]?.taskId;
          if (taskId) onSupplierDone(taskId, order.id);
        }}>标记完成</Button>
      )}
      {order.status === "in_progress" && role === "buyer" && order.orderType === "task" && (
        <Button size="sm" onClick={() => {
          const taskId = order.items[0]?.taskId;
          if (taskId) onTaskComplete(taskId, order.id);
        }}>确认完成</Button>
      )}
      {(order.status === "delivered" || order.status === "shipped") && role === "buyer" && order.orderType === "product" && (
        <Button size="sm" onClick={() => onComplete(order.id)}>确认收货</Button>
      )}
      {(order.status === "shipped" || order.status === "delivered") && order.orderType === "product" && (
        <Button variant="outline" size="sm" onClick={() => onNavigate(`/logistics/${order.id}`)}>物流</Button>
      )}
      {order.orderType === "subscription" && ["paid", "in_progress"].includes(order.status) && (
        <Button variant="outline" size="sm" onClick={() => onNavigate("/textbooks/my")}>我的教材</Button>
      )}
      {(order.status === "pending_payment" || order.status === "paid") && (
        <Button variant="outline" size="sm" className="text-red-600 border-red-200" onClick={() => onCancel(order.id)}>取消</Button>
      )}
      <Button variant="ghost" size="sm" onClick={() => onNavigate(`/orders/${order.id}`)}>详情</Button>
    </>
  );
}
