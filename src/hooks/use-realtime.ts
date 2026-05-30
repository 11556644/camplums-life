// Re-export from SSE Provider for backwards compatibility
// New code should import directly from @/components/sse-provider
export { useRealtime, useRealtimeEvents, useSSEConnected } from "@/components/sse-provider";
export type { RealtimeEvent } from "@/components/sse-provider";
