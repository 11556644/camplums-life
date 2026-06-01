"use client";

import { createContext, useContext, useEffect, useRef, useCallback, useState } from "react";
import { useAuthStore } from "@/stores/auth";

export interface RealtimeEvent {
  type: "message" | "order" | "product" | "task" | "forum" | "cabinet" | "textbook" | "connected";
  action: string;
  targetId: string;
  userId?: string;
  data?: Record<string, unknown>;
  timestamp: number;
}

type EventHandler = (event: RealtimeEvent) => void;

interface SSEContextValue {
  subscribe: (handler: EventHandler) => () => void;
  connected: boolean;
}

const SSEContext = createContext<SSEContextValue | null>(null);

export function SSEProvider({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const [connected, setConnected] = useState(false);
  const handlersRef = useRef(new Set<EventHandler>());
  const esRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closedRef = useRef(false);

  const subscribe = useCallback((handler: EventHandler) => {
    handlersRef.current.add(handler);
    return () => { handlersRef.current.delete(handler); };
  }, []);

  useEffect(() => {
    if (!user) {
      // 用户登出，关闭连接
      esRef.current?.close();
      esRef.current = null;
      setConnected(false);
      return;
    }

    closedRef.current = false;

    function connect() {
      if (closedRef.current) return;
      esRef.current?.close();

      const es = new EventSource("/api/events");
      esRef.current = es;

      es.onopen = () => setConnected(true);

      es.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data) as RealtimeEvent;
          if (event.type === "connected") return;
          // 分发给所有订阅者
          for (const handler of handlersRef.current) {
            try { handler(event); } catch { /* handler error */ }
          }
        } catch { /* parse error */ }
      };

      es.onerror = () => {
        es.close();
        setConnected(false);
        if (!closedRef.current) {
          reconnectTimerRef.current = setTimeout(connect, 3000);
        }
      };
    }

    connect();

    return () => {
      closedRef.current = true;
      esRef.current?.close();
      esRef.current = null;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      setConnected(false);
    };
  }, [user?.id]);

  return (
    <SSEContext.Provider value={{ subscribe, connected }}>
      {children}
    </SSEContext.Provider>
  );
}

/**
 * 使用 SSE 订阅事件
 * 组件卸载时自动注销
 */
export function useRealtime(
  onEvent: EventHandler,
  deps: React.DependencyList = []
) {
  const ctx = useContext(SSEContext);
  const onEventRef = useRef(onEvent);

  // 同步 ref 值（useEffect 外更新 ref 在 React 19 中不推荐，用 useLayoutEffect 替代）
  useEffect(() => {
    onEventRef.current = onEvent;
  });

  useEffect(() => {
    if (!ctx) return;
    return ctx.subscribe((event) => onEventRef.current(event));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, ...deps]);
}

/**
 * 订阅特定类型的事件
 */
export function useRealtimeEvents(
  types: string[],
  onEvent: EventHandler,
  deps: React.DependencyList = []
) {
  const typesKey = types.join(",");
  const wrappedCallback = useCallback(
    (event: RealtimeEvent) => {
      if (typesKey.split(",").includes(event.type)) onEvent(event);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [typesKey, onEvent]
  );

  useRealtime(wrappedCallback, deps);
}

/**
 * 获取 SSE 连接状态
 */
export function useSSEConnected() {
  const ctx = useContext(SSEContext);
  return ctx?.connected ?? false;
}
