"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { useAuthStore } from "@/stores/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface LogisticsNode {
  id: string;
  nodeName: string;
  sequence: number;
  status: string;
  arrivedAt: string | null;
  departedAt: string | null;
}

interface LogisticsRoute {
  id: string;
  orderId: string;
  status: string;
  currentNode: number;
  nodes: LogisticsNode[];
  buyerId: string;
  sellerId: string;
}

export default function LogisticsPage() {
  const params = useParams();
  const user = useAuthStore((s) => s.user);
  const [route, setRoute] = useState<LogisticsRoute | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchRoute = async () => {
    const res = await fetch(`/api/logistics/${params.orderId}`);
    const data = await res.json();
    if (data.success) setRoute(data.data);
    setLoading(false);
  };

  useEffect(() => {
    fetchRoute();
    const timer = setInterval(fetchRoute, 10000);
    return () => clearInterval(timer);
  }, [params.orderId]);

  const handleAdvance = async () => {
    setActionLoading(true);
    const res = await fetch(`/api/logistics/${params.orderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "advance" }),
    });
    const data = await res.json();
    if (data.success) { toast.success(data.data.message); fetchRoute(); } else toast.error(data.error);
    setActionLoading(false);
  };

  const handleDeliver = async () => {
    setActionLoading(true);
    const res = await fetch(`/api/logistics/${params.orderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "deliver" }),
    });
    const data = await res.json();
    if (data.success) { toast.success("已标记送达"); fetchRoute(); } else toast.error(data.error);
    setActionLoading(false);
  };

  if (loading) return <div className="container mx-auto px-4 py-12 text-center text-gray-400">加载中...</div>;
  if (!route) return <div className="container mx-auto px-4 py-12 text-center text-gray-400">暂无物流信息</div>;

  const isSeller = user?.id === route.sellerId;
  const isBuyer = user?.id === route.buyerId;
  const isInTransit = route.status === "in_transit";
  const isLastNode = route.currentNode >= route.nodes.length - 1;

  return (
    <div className="container mx-auto px-4 py-5 max-w-xl">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">物流追踪</CardTitle>
            <Badge variant={route.status === "delivered" ? "default" : "secondary"}>
              {route.status === "in_transit" ? "运输中" : route.status === "delivered" ? "已送达" : "已退回"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="relative pl-6">
            {route.nodes.map((node, i) => {
              const isActive = node.status === "arrived";
              const isDone = node.status === "departed" || (i < route.currentNode);
              const isPending = node.status === "pending";

              return (
                <div key={node.id} className="relative pb-6 last:pb-0">
                  {/* 连接线 */}
                  {i < route.nodes.length - 1 && (
                    <div className={`absolute left-0 top-4 w-0.5 h-full ${isDone ? "bg-green-500" : "bg-gray-200"}`}
                      style={{ transform: "translateX(-50%)", left: "-12px" }} />
                  )}
                  {/* 圆点 */}
                  <div className={`absolute left-0 top-1 w-3 h-3 rounded-full border-2 -translate-x-1/2 ${
                    isActive ? "bg-blue-500 border-blue-500 animate-pulse" :
                    isDone ? "bg-green-500 border-green-500" :
                    "bg-white border-gray-300"
                  }`} />
                  <div className="ml-2">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-medium ${isPending ? "text-gray-400" : ""}`}>{node.nodeName}</span>
                      {isActive && <Badge className="bg-blue-500 animate-pulse">当前</Badge>}
                    </div>
                    {node.arrivedAt && (
                      <p className="text-xs text-gray-500 mt-0.5">
                        到达：{new Date(node.arrivedAt).toLocaleString("zh-CN")}
                      </p>
                    )}
                    {node.departedAt && (
                      <p className="text-xs text-gray-500">
                        离开：{new Date(node.departedAt).toLocaleString("zh-CN")}
                      </p>
                    )}
                    {isPending && <p className="text-xs text-gray-400 mt-0.5">等待中</p>}
                  </div>
                </div>
              );
            })}
          </div>

          {/* 卖家操作区 */}
          {isSeller && isInTransit && (
            <div className="mt-4 pt-4 border-t space-y-2">
              {!isLastNode ? (
                <Button className="w-full" onClick={handleAdvance} disabled={actionLoading}>
                  {actionLoading ? "更新中..." : `推进到下一站：${route.nodes[route.currentNode + 1]?.nodeName || ""}`}
                </Button>
              ) : (
                <Button className="w-full bg-green-600 hover:bg-green-700" onClick={handleDeliver} disabled={actionLoading}>
                  {actionLoading ? "更新中..." : "确认送达"}
                </Button>
              )}
            </div>
          )}

          {/* 买家提示 */}
          {isBuyer && isInTransit && (
            <div className="mt-4 pt-4 border-t">
              <p className="text-sm text-gray-500 text-center">物流更新中，请耐心等待</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
