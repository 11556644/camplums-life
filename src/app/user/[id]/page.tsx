"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChatBox } from "@/components/chat/chat-box";

const ROLE_LABELS: Record<string, string> = {
  buyer: "买家", seller: "卖家", floor_leader: "楼长",
  service_provider: "技能服务者", admin: "管理员",
};

interface UserInfo {
  id: string;
  nickname: string;
  avatar: string | null;
  department: string | null;
  dormitory: string | null;
  enrollYear: number | null;
  roles: { role: string }[];
  creditScore: { score: number } | null;
  avgRating: number | null;
  products: { id: string; title: string; price: number }[];
  tasks: { id: string; title: string; budget: number | null }[];
  receivedRatings: { id: string; score: number; content: string | null; rater: { nickname: string }; createdAt: string }[];
}

export default function UserProfilePage() {
  const params = useParams();
  const [info, setInfo] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [chatOpen, setChatOpen] = useState(false);

  useEffect(() => {
    fetch(`/api/user/${params.id}`).then(r => r.json()).then(d => {
      if (d.success) setInfo(d.data);
      setLoading(false);
    });
  }, [params.id]);

  if (loading) return <div className="container mx-auto px-4 py-12 text-center text-gray-400">加载中...</div>;
  if (!info) return <div className="container mx-auto px-4 py-12 text-center text-gray-400">用户不存在</div>;

  return (
    <div className="container mx-auto px-4 py-5 max-w-2xl space-y-4">
      {/* 用户卡片 */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center text-2xl font-bold text-blue-600">
              {info.nickname[0]}
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-bold">{info.nickname}</h2>
              <div className="flex gap-2 mt-1">
                {info.roles.map(r => (
                  <Badge key={r.role} variant="secondary">{ROLE_LABELS[r.role] || r.role}</Badge>
                ))}
              </div>
              <p className="text-sm text-gray-500 mt-1">{info.department || "未填写院系"} · {info.dormitory || "未填写宿舍"}</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4 mt-4 text-center">
            <div>
              <div className="text-2xl font-bold text-green-600">{info.creditScore?.score ?? 100}</div>
              <div className="text-xs text-gray-500">信用分</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-yellow-500">{info.avgRating !== null ? info.avgRating.toFixed(1) : "暂无"}</div>
              <div className="text-xs text-gray-500">平均评分</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-blue-600">{info.products.length + info.tasks.length}</div>
              <div className="text-xs text-gray-500">在售/在接</div>
            </div>
          </div>
          <Button className="w-full mt-4" variant="outline" onClick={() => setChatOpen(true)}>
            聊一聊
          </Button>
        </CardContent>
      </Card>

      {/* 在售商品 */}
      {info.products.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-lg">在售商品</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {info.products.map(p => (
              <Link key={p.id} href={`/products/${p.id}`} className="flex items-center justify-between p-2 rounded hover:bg-gray-50">
                <span className="text-sm">{p.title}</span>
                <span className="text-sm text-red-600 font-bold">¥{p.price}</span>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      {/* 发布任务 */}
      {info.tasks.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-lg">发布任务</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {info.tasks.map(t => (
              <Link key={t.id} href={`/tasks/${t.id}`} className="flex items-center justify-between p-2 rounded hover:bg-gray-50">
                <span className="text-sm">{t.title}</span>
                <span className="text-sm text-orange-600">{t.budget ? `¥${t.budget}` : "面议"}</span>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      {/* 评价 */}
      {info.receivedRatings.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-lg">收到的评价</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {info.receivedRatings.map(r => (
              <div key={r.id} className="border-b pb-2 last:border-0">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{r.rater.nickname}</span>
                  <span className="text-yellow-500">{"★".repeat(r.score)}{"☆".repeat(5 - r.score)}</span>
                </div>
                {r.content && <p className="text-sm text-gray-600 mt-1">{r.content}</p>}
                <span className="text-xs text-gray-400">{new Date(r.createdAt).toLocaleDateString("zh-CN")}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {chatOpen && (
        <ChatBox
          receiverId={info.id}
          receiverName={info.nickname}
          open={chatOpen}
          onClose={() => setChatOpen(false)}
        />
      )}
    </div>
  );
}
