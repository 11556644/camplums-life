/**
 * 内存事件总线 — 用于 SSE 实时推送
 *
 * 生产环境应替换为 Redis Pub/Sub（多实例部署时需要）。
 * 单体原型阶段内存方案足够。
 */

type EventHandler = (event: RealtimeEvent) => void;

export interface RealtimeEvent {
  type: "message" | "order" | "product" | "task" | "forum" | "cabinet" | "textbook";
  action: string;       // created, updated, status_changed, new_message, etc.
  targetId: string;     // orderId, productId, postId, etc.
  userId?: string;      // 触发者
  data?: Record<string, unknown>;
  timestamp: number;
}

class EventBus {
  private listeners = new Map<string, Set<EventHandler>>();

  subscribe(userId: string, handler: EventHandler): () => void {
    if (!this.listeners.has(userId)) {
      this.listeners.set(userId, new Set());
    }
    this.listeners.get(userId)!.add(handler);
    const totalListeners = [...this.listeners.values()].reduce((sum, s) => sum + s.size, 0);
    console.log(`[SSE] subscribe user=${userId} → total listeners: ${totalListeners}`);
    return () => {
      this.listeners.get(userId)?.delete(handler);
      if (this.listeners.get(userId)?.size === 0) {
        this.listeners.delete(userId);
      }
    };
  }

  publish(event: RealtimeEvent, targetUserIds: string[]) {
    for (const userId of targetUserIds) {
      const handlers = this.listeners.get(userId);
      if (handlers) {
        for (const handler of handlers) {
          try { handler(event); } catch { /* ignore */ }
        }
      }
    }
  }

  /** 广播给所有在线用户 */
  broadcast(event: RealtimeEvent) {
    let count = 0;
    for (const handlers of this.listeners.values()) {
      for (const handler of handlers) {
        try { handler(event); count++; } catch { /* ignore */ }
      }
    }
    if (count > 0) {
      console.log(`[SSE] broadcast ${event.type}:${event.action} → ${count} listeners`);
    } else {
      console.log(`[SSE] broadcast ${event.type}:${event.action} → 0 listeners (no one online)`);
    }
  }
}

// 全局单例
const globalBus = globalThis as unknown as { __eventBus?: EventBus };
if (!globalBus.__eventBus) {
  globalBus.__eventBus = new EventBus();
}
export const eventBus = globalBus.__eventBus!;

/**
 * 发布事件的便捷函数
 * 在 API 路由中调用，推送给相关用户
 */
export function publishEvent(event: Omit<RealtimeEvent, "timestamp">, targetUserIds: string[]) {
  eventBus.publish({ ...event, timestamp: Date.now() }, targetUserIds);
}

/**
 * 广播事件给所有在线用户
 * 用于商品/任务/帖子等全站可见内容的变更通知
 */
export function broadcastEvent(event: Omit<RealtimeEvent, "timestamp">) {
  eventBus.broadcast({ ...event, timestamp: Date.now() });
}
