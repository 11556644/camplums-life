"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useAuthStore } from "@/stores/auth";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChatBox } from "@/components/chat/chat-box";
import { useRealtime, RealtimeEvent } from "@/hooks/use-realtime";

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  system: { label: "系统", color: "bg-gray-100 text-gray-700" },
  order: { label: "订单", color: "bg-blue-100 text-blue-700" },
  notification: { label: "通知", color: "bg-green-100 text-green-700" },
  chat: { label: "聊天", color: "bg-purple-100 text-purple-700" },
};

interface Msg {
  id: string; title: string | null; content: string; type: string;
  readAt: string | null; createdAt: string; senderId: string | null;
}

export default function MessagesPage() {
  const user = useAuthStore((s) => s.user);
  const router = useRouter();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [replyTo, setReplyTo] = useState<{ id: string; name: string } | null>(null);

  const fetchMessages = useCallback(async () => {
    const res = await fetch("/api/messages");
    const data = await res.json();
    if (data.success) {
      setMessages(data.data);
      // 标记聊天消息已读（按发送者）
      const unreadSenders = data.data
        .filter((m: Msg) => !m.readAt && m.senderId && m.type === "chat")
        .map((m: Msg) => m.senderId!)
        .filter((id: string, i: number, arr: string[]) => arr.indexOf(id) === i);
      for (const senderId of unreadSenders) {
        fetch("/api/messages/read", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ senderId }),
        }).catch(() => {});
      }
      // 标记所有通知类消息已读
      const hasUnreadNotifications = data.data.some((m: Msg) => !m.readAt && m.type !== "chat");
      if (hasUnreadNotifications) {
        fetch("/api/messages/read", { method: "PATCH" }).catch(() => {});
      }
      // 通知 Navbar 刷新未读数
      if (unreadSenders.length > 0 || hasUnreadNotifications) {
        window.dispatchEvent(new Event("unread-updated"));
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!user) { router.push("/login"); return; }
    fetchMessages();
  }, [user, router, fetchMessages]);

  // SSE：新消息时静默刷新
  const handleRealtime = useCallback((event: RealtimeEvent) => {
    if (event.type === "message") fetchMessages();
  }, [fetchMessages]);
  useRealtime(handleRealtime, []);

  // 从通知内容中提取关联实体链接
  const getEntityLink = (msg: Msg): { href: string; label: string } | null => {
    const content = msg.content;
    // 订单号
    const orderMatch = content.match(/订单\s*(ORD\w+)/);
    if (orderMatch) return { href: `/orders`, label: `查看订单 ${orderMatch[1]}` };
    // 任务相关
    if (content.includes("任务") && msg.title?.includes("接单")) return { href: "/orders", label: "查看订单" };
    // 投诉相关
    if (content.includes("投诉")) return { href: "/disputes", label: "查看投诉" };
    return null;
  };

  if (!user) return null;

  const filtered = filter === "all" ? messages : messages.filter(m => m.type === filter);

  return (
    <div className="container mx-auto px-4 py-5 max-w-2xl">
      <h1 className="text-2xl font-bold mb-4">消息中心</h1>

      <div className="flex gap-2 mb-4 flex-wrap">
        {[{ key: "all", label: "全部" }, ...Object.entries(TYPE_LABELS).map(([k, v]) => ({ key: k, label: v.label }))].map(t => (
          <button key={t.key} onClick={() => setFilter(t.key)}
            className={`px-3 py-1 rounded-full text-sm ${filter === t.key ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">加载中...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400">暂无消息</div>
      ) : (
        <div className="space-y-2">
          {filtered.map((msg) => {
            const typeInfo = TYPE_LABELS[msg.type] || { label: msg.type, color: "bg-gray-100" };
            const entityLink = getEntityLink(msg);
            return (
              <Card key={msg.id} className={!msg.readAt ? "ring-1 ring-blue-100" : "opacity-70"}>
                <CardContent className="py-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge className={typeInfo.color}>{typeInfo.label}</Badge>
                        {!msg.readAt && <span className="h-2 w-2 rounded-full bg-blue-500" />}
                      </div>
                      {msg.title && <p className="font-medium text-sm">{msg.title}</p>}
                      <p className="text-sm text-gray-600">{msg.content}</p>
                      <div className="flex gap-2 mt-2">
                        {entityLink && (
                          <Link href={entityLink.href}>
                            <Button variant="outline" size="sm">{entityLink.label}</Button>
                          </Link>
                        )}
                        {/* 有发送者的通知可以回复 */}
                        {msg.senderId && msg.type !== "chat" && (
                          <Button variant="ghost" size="sm" onClick={() => setReplyTo({ id: msg.senderId!, name: msg.title || "对方" })}>
                            回复
                          </Button>
                        )}
                      </div>
                    </div>
                    <span className="text-xs text-gray-400 shrink-0 ml-2">{new Date(msg.createdAt).toLocaleString("zh-CN")}</span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* 回复聊天框 */}
      {replyTo && (
        <ChatBox
          receiverId={replyTo.id}
          receiverName={replyTo.name}
          open={!!replyTo}
          onClose={() => setReplyTo(null)}
        />
      )}
    </div>
  );
}
