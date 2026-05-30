"use client";

import { useState, useEffect, useRef } from "react";
import { useAuthStore } from "@/stores/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { X, ImagePlus } from "lucide-react";

interface ChatMessage {
  id: string;
  senderId: string;
  receiverId: string;
  content: string;
  metadata: string | null;
  createdAt: string;
}

interface ChatBoxProps {
  receiverId: string;
  receiverName: string;
  productId?: string;
  orderId?: string;
  open: boolean;
  onClose: () => void;
}

export function ChatBox({ receiverId, receiverName, productId, orderId, open, onClose }: ChatBoxProps) {
  const user = useAuthStore((s) => s.user);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open || !user) return;
    const fetchMessages = async () => {
      const params = new URLSearchParams({ userId: receiverId });
      if (orderId) params.set("orderId", orderId);
      if (productId) params.set("productId", productId);
      const res = await fetch(`/api/chat?${params}`);
      const data = await res.json();
      if (data.success) setMessages(data.data);
    };
    fetchMessages();
    const timer = setInterval(fetchMessages, 3000);
    return () => clearInterval(timer);
  }, [open, receiverId, orderId, productId, user]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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
      setMessages((prev) => [...prev, data.data]);
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
      } catch { /* skip failed uploads */ }
    }

    if (imageUrls.length > 0) {
      await sendMessage("", imageUrls);
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const parseMetadata = (metadata: string | null): { images?: string[] } => {
    if (!metadata) return {};
    try { return JSON.parse(metadata); } catch { return {}; }
  };

  if (!open || !user) return null;

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
          <div className="h-72 overflow-y-auto p-3 space-y-2 bg-gray-50">
            {messages.length === 0 && (
              <p className="text-center text-gray-400 text-xs py-8">发送消息开始聊天</p>
            )}
            {messages.map((msg) => {
              const isMe = msg.senderId === user.id;
              const meta = parseMetadata(msg.metadata);
              return (
                <div key={msg.id} className={`flex w-full ${isMe ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[75%] px-3 py-1.5 rounded-xl text-sm ${isMe ? "bg-blue-500 text-white rounded-br-sm" : "bg-white border rounded-bl-sm"}`}>
                    {/* 图片 */}
                    {meta.images && meta.images.length > 0 && (
                      <div className="space-y-1 mb-1">
                        {meta.images.map((url, i) => (
                          <img
                            key={i}
                            src={url}
                            alt="聊天图片"
                            className="max-w-full rounded cursor-pointer hover:opacity-90"
                            style={{ maxHeight: 160 }}
                            onClick={() => window.open(url, "_blank")}
                          />
                        ))}
                      </div>
                    )}
                    {/* 文字 */}
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
          <div className="flex border-t">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleImageUpload}
              className="hidden"
            />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="px-2 text-gray-400 hover:text-blue-500 transition-colors"
              title="发送图片"
            >
              <ImagePlus className="w-5 h-5" />
            </button>
            <Input
              placeholder={uploading ? "上传中..." : "输入消息..."}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage(input)}
              className="border-0 rounded-none focus-visible:ring-0"
              disabled={uploading}
            />
            <Button onClick={() => sendMessage(input)} disabled={sending || uploading || !input.trim()} className="rounded-none px-4">
              发送
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// 聊一聊按钮
export function ChatButton({ receiverId, receiverName, productId }: { receiverId: string; receiverName: string; productId?: string }) {
  const user = useAuthStore((s) => s.user);
  const [open, setOpen] = useState(false);

  if (!user || user.id === receiverId) return null;

  return (
    <>
      <Button variant="outline" className="w-full" onClick={() => setOpen(true)}>
        聊一聊
      </Button>
      <ChatBox
        receiverId={receiverId}
        receiverName={receiverName}
        productId={productId}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
