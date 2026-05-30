"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/stores/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ChatBox } from "@/components/chat-box";
import { useRealtime, RealtimeEvent } from "@/hooks/use-realtime";

interface Conversation {
  otherUserId: string;
  lastMessage: string;
  lastTime: string;
  unread: number;
  user: { id: string; nickname: string; avatar: string | null; department: string | null };
}

interface SearchResult {
  id: string; nickname: string; department: string | null; dormitory: string | null;
}

export default function ChatsPage() {
  const user = useAuthStore((s) => s.user);
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeChat, setActiveChat] = useState<Conversation | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  const fetchConversations = useCallback(async () => {
    const res = await fetch("/api/chat/conversations");
    const data = await res.json();
    if (data.success) setConversations(data.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!user) { router.push("/login"); return; }
    fetchConversations();
  }, [user, router, fetchConversations]);

  // SSE：新消息时静默刷新会话列表
  const handleRealtime = useCallback((event: RealtimeEvent) => {
    if (event.type === "message") fetchConversations();
  }, [fetchConversations]);
  useRealtime(handleRealtime, []);

  const openChat = async (conv: Conversation) => {
    setActiveChat(conv);
    if (conv.unread > 0) {
      await fetch("/api/messages/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ senderId: conv.otherUserId }),
      });
      setConversations(prev =>
        prev.map(c => c.otherUserId === conv.otherUserId ? { ...c, unread: 0 } : c)
      );
      // 通知 Navbar 刷新未读数
      window.dispatchEvent(new Event("unread-updated"));
    }
  };

  const handleSearch = async (q: string) => {
    setSearchQuery(q);
    if (q.length < 1) { setSearchResults([]); return; }
    setSearching(true);
    const res = await fetch(`/api/users/search?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    if (data.success) setSearchResults(data.data);
    setSearching(false);
  };

  const startNewChat = (u: SearchResult) => {
    setActiveChat({
      otherUserId: u.id,
      lastMessage: "",
      lastTime: new Date().toISOString(),
      unread: 0,
      user: { id: u.id, nickname: u.nickname, avatar: null, department: u.department },
    });
    setSearchQuery("");
    setSearchResults([]);
  };

  if (!user) return null;

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <h1 className="text-2xl font-bold mb-4">聊天</h1>

      {/* 搜索用户发起新对话 */}
      <div className="mb-4">
        <Input placeholder="搜索用户昵称、手机号、学号..." value={searchQuery}
          onChange={e => handleSearch(e.target.value)} />
        {searchResults.length > 0 && (
          <div className="mt-1 border rounded-lg bg-white shadow-sm max-h-48 overflow-y-auto">
            {searchResults.map(u => (
              <button key={u.id} onClick={() => startNewChat(u)}
                className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center justify-between border-b last:border-0">
                <div>
                  <span className="font-medium text-sm">{u.nickname}</span>
                  {u.department && <span className="text-xs text-gray-400 ml-2">{u.department}</span>}
                </div>
                <span className="text-xs text-blue-500">发起对话</span>
              </button>
            ))}
          </div>
        )}
        {searchQuery && searchResults.length === 0 && !searching && (
          <p className="text-xs text-gray-400 mt-1">未找到用户</p>
        )}
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">加载中...</div>
      ) : conversations.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="mb-2">暂无聊天记录</p>
          <p className="text-sm">在商品或任务详情页点击「聊一聊」开始对话</p>
        </div>
      ) : (
        <div className="space-y-2">
          {conversations.map((conv) => (
            <Card
              key={conv.otherUserId}
              className={`cursor-pointer hover:shadow-md transition-shadow ${conv.unread > 0 ? "ring-1 ring-blue-200 bg-blue-50/30" : ""}`}
              onClick={() => openChat(conv)}
            >
              <CardContent className="py-3 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold shrink-0">
                  {conv.user.nickname[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Link href={`/user/${conv.otherUserId}`} onClick={e => e.stopPropagation()}
                        className="font-medium text-sm hover:text-blue-600">
                        {conv.user.nickname}
                      </Link>
                      {conv.user.department && <span className="text-xs text-gray-400">{conv.user.department}</span>}
                    </div>
                    <span className="text-xs text-gray-400">{new Date(conv.lastTime).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                  <div className="flex items-center justify-between mt-0.5">
                    <p className="text-sm text-gray-500 truncate">{conv.lastMessage}</p>
                    {conv.unread > 0 && <Badge className="ml-2 bg-red-500 shrink-0">{conv.unread}</Badge>}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {activeChat && (
        <ChatBox
          receiverId={activeChat.otherUserId}
          receiverName={activeChat.user.nickname}
          open={!!activeChat}
          onClose={() => setActiveChat(null)}
        />
      )}
    </div>
  );
}
