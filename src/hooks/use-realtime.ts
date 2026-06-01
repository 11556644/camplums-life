// Re-export from SSE Provider for backwards compatibility
// New code should import directly from @/components/providers/sse-provider
export { useRealtime, useRealtimeEvents, useSSEConnected } from "@/components/providers/sse-provider";
export type { RealtimeEvent } from "@/components/providers/sse-provider";
