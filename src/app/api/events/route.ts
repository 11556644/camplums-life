import { requireAuth } from "@/lib/api-helpers";
import { eventBus, RealtimeEvent } from "@/lib/realtime";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await requireAuth(req);

  const userId = session.userId;
  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      // 发送初始连接确认
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "connected", userId })}\n\n`));

      // 心跳：每 30 秒发一次，防止连接断开
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: heartbeat\n\n`));
        } catch {
          clearInterval(heartbeat);
        }
      }, 30000);

      // 订阅事件
      unsubscribe = eventBus.subscribe(userId, (event: RealtimeEvent) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          // 连接已断开
          unsubscribe?.();
          clearInterval(heartbeat);
        }
      });

      // 连接关闭时清理
      req.signal.addEventListener("abort", () => {
        unsubscribe?.();
        clearInterval(heartbeat);
        try { controller.close(); } catch { /* already closed */ }
      });
    },
    cancel() {
      unsubscribe?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no", // 禁止 Nginx 缓冲
    },
  });
}
