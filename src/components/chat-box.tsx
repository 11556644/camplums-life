"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useAuthStore } from "@/stores/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { X, ImagePlus } from "lucide-react";
import { useRealtime, RealtimeEvent } from "@/hooks/use-realtime";

interface ChatMessage {
  id: string;
  senderId: string;
  receiverId: string;
  content: string;
  metadata: string | null;
  createdAt: string;
}

interface ChatCoreProps {
  receiverId: string;
  receiverName: string;
  productId?: string;
  orderId?: string;
  /** floating = 右下角悬浮窗，inline = 页面内嵌卡片 */
  variant: "floating" | "inline";
  open?: boolean;
  onClose?: () => void;
}

function parseMetadata(metadata: string | null): { images?: string[] } {
  if (!metadata) return {};
  try { return JSON.parse(metadata); } catch { return {}; }
}

export function ChatCore({ receiverId, receiverName, productId, orderId, variant, open = true, onClose }: ChatCoreProps) {
  const user = useAuthStore((s) => s.user);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // 初始加载
  useEffect(() => {
    if (!open || !user) return;
    const params = new URLSearchParams({ userId: receiverId });
    if (orderId) params.set("orderId", orderId);
    if (productId) params.set("productId", productId);
    fetch(`/api/chat?${params}`)
      .then(r => r.json())
      .then(d => { if (d.success) setMessages(d.data); });
  }, [open, receiverId, orderId, productId, user]);

  // SSE 实时接收
  const handleRealtime = useCallback((event: RealtimeEvent) => {
    if (event.type === "message" && event.action === "new_message") {
      const msg = event.data?.message as ChatMessage | undefined;
      if (msg && (msg.senderId === receiverId || msg.senderId === user?.id)) {
        setMessages(prev => {
          if (prev.some(m => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
      }
    }
  }, [receiverId, user?.id]);

  useRealtime(handleRealtime, [receiverId]);

  useEffect(() => {
    if (messages.length > 0) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const sendMessage = async (content: string, images?: string[]) => {
    if ((!content.trim() && (!images || images.length === 0)) || sending) return;
    setSending(true);
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ receiverId, content, images, orderId, productId }),
    });
    const data = await res.json();
    if (data.success) {
      setMessages(prev => [...prev, data.data]);
      setInput("");
    }
    setSending(false);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    const imageUrls: string[] = [];
    for (const file of Array.from(files)) {
      const formData = new FormData();
      formData.append("file", file);
      try {
        const res = await fetch("/api/upload", { method: "POST", body: formData });
        const data = await res.json();
        if (data.success) imageUrls.push(data.data.url);
      } catch { /* skip */ }
    }
    if (imageUrls.length > 0) await sendMessage("", imageUrls);
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const content = (
    <>
      <div className={`${variant === "floating" ? "h-72" : "h-64"} overflow-y-auto p-3 space-y-2 bg-gray-50`}>
        {messages.length === 0 && (
          <p className="text-center text-gray-400 text-xs py-8">
            {variant === "floating" ? "发送消息开始聊天" : "暂无消息，发送第一条吧"}
          </p>
        )}
        {messages.map(msg => {
          const isMe = msg.senderId === user!.id;
          const meta = parseMetadata(msg.metadata);
          return (
            <div key={msg.id} className={`flex w-full ${isMe ? "justify-end" : "justify-start"}`}>
              <div className={`${variant === "floating" ? "max-w-[75%] rounded-xl" : "max-w-[70%] rounded-lg"} px-3 py-1.5 text-sm ${isMe ? "bg-blue-500 text-white rounded-br-sm" : "bg-white border rounded-bl-sm"}`}>
                {meta.images && meta.images.length > 0 && (
                  <div className="space-y-1 mb-1">
                    {meta.images.map((url, i) => (
                      <img key={i} src={url} alt="图片" className="max-w-full rounded cursor-pointer hover:opacity-90" style={{ maxHeight: 160 }} onClick={() => window.open(url, "_blank")} />
                    ))}
                  </div>
                )}
                {msg.content && msg.content !== "[图片]" && <div>{msg.content}</div>}
                <div className={`text-[10px] mt-0.5 ${isMe ? "text-blue-100" : "text-gray-400"}`}>
                  {new Date(msg.createdAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
      <div className={variant === "floating" ? "flex border-t" : "flex gap-2"}>
        <input ref={fileRef} type="file" accept="image/*" multiple onChange={handleImageUpload} className="hidden" />
        <button onClick={() => fileRef.current?.click()} disabled={uploading}
          className={`${variant === "floating" ? "px-2" : "px-2"} text-gray-400 hover:text-blue-500 transition-colors`} title="发送图片">
          <ImagePlus className="w-5 h-5" />
        </button>
        <Input
          placeholder={uploading ? "上传中..." : "输入消息..."}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendMessage(input)}
          className={variant === "floating" ? "border-0 rounded-none focus-visible:ring-0" : ""}
          disabled={uploading}
        />
        <Button onClick={() => sendMessage(input)} disabled={sending || uploading || !input.trim()}
          className={variant === "floating" ? "rounded-none px-4" : ""}>
          发送
        </Button>
      </div>
    </>
  );

  if (!open || !user) return null;

  // 浮窗模式 — 只返回内容，外层 Card 由 ChatBox/ChatButton 提供
  if (variant === "floating") {
    return <>{content}</>;
  }

  // 内嵌模式
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">与 {receiverName} 的对话</CardTitle>
      </CardHeader>
      <CardContent>{content}</CardContent>
    </Card>
  );
}

// ==================== 便捷封装 ====================

/** 浮窗聊一聊按钮 */
export function ChatButton({ receiverId, receiverName, productId }: { receiverId: string; receiverName: string; productId?: string }) {
  const user = useAuthStore((s) => s.user);
  const [open, setOpen] = useState(false);

  if (!user || user.id === receiverId) return null;

  return (
    <>
      <Button variant="outline" className="w-full" onClick={() => setOpen(true)}>聊一聊</Button>
      {open && (
        <div className="fixed bottom-4 right-4 w-80 z-50 shadow-xl">
          <Card>
            <CardHeader className="py-2 px-3 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm">与 {receiverName} 的对话</CardTitle>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </CardHeader>
            <CardContent className="p-0">
              <ChatCore receiverId={receiverId} receiverName={receiverName} productId={productId} variant="floating" open={open} />
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}

/** 浮窗聊天（兼容旧接口） */
export function ChatBox({ receiverId, receiverName, productId, orderId, open, onClose }: {
  receiverId: string; receiverName: string; productId?: string; orderId?: string; open: boolean; onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed bottom-4 right-4 w-80 z-50 shadow-xl">
      <Card>
        <CardHeader className="py-2 px-3 flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-sm">与 {receiverName} 的对话</CardTitle>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </CardHeader>
        <CardContent className="p-0">
          <ChatCore receiverId={receiverId} receiverName={receiverName} productId={productId} orderId={orderId} variant="floating" />
        </CardContent>
      </Card>
    </div>
  );
}

/** 订单内嵌聊天 */
export function OrderChat({ orderId, otherUserId, otherUserName }: { orderId: string; otherUserId: string; otherUserName: string }) {
  return <ChatCore receiverId={otherUserId} receiverName={otherUserName} orderId={orderId} variant="inline" />;
}
