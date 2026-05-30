"use client";

import { useState, useEffect, useRef } from "react";
import { useAuthStore } from "@/stores/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ImagePlus } from "lucide-react";

interface ChatMessage {
  id: string;
  senderId: string;
  receiverId: string;
  content: string;
  metadata: string | null;
  createdAt: string;
}

export function OrderChat({ orderId, otherUserId, otherUserName }: { orderId: string; otherUserId: string; otherUserName: string }) {
  const user = useAuthStore((s) => s.user);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const fetchMessages = async () => {
      const res = await fetch(`/api/chat?userId=${otherUserId}&orderId=${orderId}`);
      const data = await res.json();
      if (data.success) setMessages(data.data);
    };
    fetchMessages();
    const timer = setInterval(fetchMessages, 5000);
    return () => clearInterval(timer);
  }, [orderId, otherUserId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async (content: string, images?: string[]) => {
    if ((!content.trim() && (!images || images.length === 0)) || sending) return;
    setSending(true);
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ receiverId: otherUserId, content, images, orderId }),
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
      } catch { /* skip */ }
    }
    if (imageUrls.length > 0) await sendMessage("", imageUrls);
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const parseMetadata = (metadata: string | null): { images?: string[] } => {
    if (!metadata) return {};
    try { return JSON.parse(metadata); } catch { return {}; }
  };

  if (!user) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">与 {otherUserName} 的对话</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-64 overflow-y-auto border rounded-lg p-3 mb-3 space-y-2 bg-gray-50">
          {messages.length === 0 && (
            <p className="text-center text-gray-400 text-sm py-8">暂无消息，发送第一条吧</p>
          )}
          {messages.map((msg) => {
            const isMe = msg.senderId === user.id;
            const meta = parseMetadata(msg.metadata);
            return (
              <div key={msg.id} className={`flex w-full ${isMe ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[70%] px-3 py-2 rounded-lg text-sm ${isMe ? "bg-blue-500 text-white" : "bg-white border"}`}>
                  {meta.images && meta.images.length > 0 && (
                    <div className="space-y-1 mb-1">
                      {meta.images.map((url, i) => (
                        <img key={i} src={url} alt="图片" className="max-w-full rounded cursor-pointer" style={{ maxHeight: 160 }}
                          onClick={() => window.open(url, "_blank")} />
                      ))}
                    </div>
                  )}
                  {msg.content && msg.content !== "[图片]" && <div>{msg.content}</div>}
                  <div className={`text-xs mt-1 ${isMe ? "text-blue-100" : "text-gray-400"}`}>
                    {new Date(msg.createdAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
        <div className="flex gap-2">
          <input ref={fileRef} type="file" accept="image/*" multiple onChange={handleImageUpload} className="hidden" />
          <button onClick={() => fileRef.current?.click()} disabled={uploading}
            className="px-2 text-gray-400 hover:text-blue-500" title="发送图片">
            <ImagePlus className="w-5 h-5" />
          </button>
          <Input
            placeholder={uploading ? "上传中..." : "输入消息..."}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendMessage(input)}
            disabled={uploading}
          />
          <Button onClick={() => sendMessage(input)} disabled={sending || uploading || !input.trim()}>发送</Button>
        </div>
      </CardContent>
    </Card>
  );
}
