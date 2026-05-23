"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

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
}

export default function LogisticsPage() {
  const params = useParams();
  const [route, setRoute] = useState<LogisticsRoute | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRoute = async () => {
      const res = await fetch(`/api/logistics/${params.orderId}`);
      const data = await res.json();
      if (data.success) setRoute(data.data);
      setLoading(false);
    };
    fetchRoute();
    const timer = setInterval(fetchRoute, 10000);
    return () => clearInterval(timer);
  }, [params.orderId]);

  if (loading) return <div className="container mx-auto px-4 py-12 text-center text-gray-400">加载中...</div>;
  if (!route) return <div className="container mx-auto px-4 py-12 text-center text-gray-400">暂无物流信息</div>;

  return (
    <div className="container mx-auto px-4 py-8 max-w-xl">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">物流追踪</CardTitle>
            <Badge variant={route.status === "delivered" ? "default" : "secondary"}>
              {route.status === "in_transit" ? "运输中" : route.status === "delivered" ? "已送达" : "已退回"}
            </Badge>
          </div>
          <p className="text-sm text-gray-500">订单号：{route.orderId}</p>
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
        </CardContent>
      </Card>
    </div>
  );
}
