// 订单状态机：统一管理所有订单的状态迁移
// 禁止直接 UPDATE 状态，必须通过状态机

export const ORDER_STATUS = {
  PENDING_PAYMENT: "pending_payment",
  PAID: "paid",
  SHIPPED: "shipped",
  DELIVERED: "delivered",
  IN_PROGRESS: "in_progress",
  STORED: "stored",
  RETRIEVED: "retrieved",
  COMPLETED: "completed",
  DISPUTED: "disputed",
  CANCELLED: "cancelled",
  REFUNDED: "refunded",
} as const;

export type OrderStatus = (typeof ORDER_STATUS)[keyof typeof ORDER_STATUS];

// 每种订单类型允许的状态迁移路径
const TRANSITIONS: Record<string, Record<string, string[]>> = {
  product: {
    [ORDER_STATUS.PENDING_PAYMENT]: [ORDER_STATUS.PAID, ORDER_STATUS.CANCELLED],
    [ORDER_STATUS.PAID]: [ORDER_STATUS.SHIPPED, ORDER_STATUS.CANCELLED, ORDER_STATUS.DISPUTED],
    [ORDER_STATUS.SHIPPED]: [ORDER_STATUS.DELIVERED, ORDER_STATUS.DISPUTED],
    [ORDER_STATUS.DELIVERED]: [ORDER_STATUS.COMPLETED, ORDER_STATUS.DISPUTED],
    [ORDER_STATUS.DISPUTED]: [ORDER_STATUS.COMPLETED, ORDER_STATUS.REFUNDED, ORDER_STATUS.CANCELLED],
    [ORDER_STATUS.CANCELLED]: [],
    [ORDER_STATUS.COMPLETED]: [],
    [ORDER_STATUS.REFUNDED]: [],
  },
  task: {
    [ORDER_STATUS.PENDING_PAYMENT]: [ORDER_STATUS.PAID, ORDER_STATUS.CANCELLED],
    [ORDER_STATUS.PAID]: [ORDER_STATUS.IN_PROGRESS, ORDER_STATUS.CANCELLED, ORDER_STATUS.DISPUTED],
    [ORDER_STATUS.IN_PROGRESS]: [ORDER_STATUS.COMPLETED, ORDER_STATUS.DISPUTED],
    [ORDER_STATUS.DISPUTED]: [ORDER_STATUS.COMPLETED, ORDER_STATUS.REFUNDED],
    [ORDER_STATUS.CANCELLED]: [],
    [ORDER_STATUS.COMPLETED]: [],
    [ORDER_STATUS.REFUNDED]: [],
  },
  storage: {
    [ORDER_STATUS.PENDING_PAYMENT]: [ORDER_STATUS.PAID, ORDER_STATUS.CANCELLED],
    [ORDER_STATUS.PAID]: [ORDER_STATUS.STORED, ORDER_STATUS.CANCELLED],
    [ORDER_STATUS.STORED]: [ORDER_STATUS.RETRIEVED, ORDER_STATUS.DISPUTED],
    [ORDER_STATUS.RETRIEVED]: [ORDER_STATUS.COMPLETED],
    [ORDER_STATUS.DISPUTED]: [ORDER_STATUS.COMPLETED, ORDER_STATUS.REFUNDED],
    [ORDER_STATUS.CANCELLED]: [],
    [ORDER_STATUS.COMPLETED]: [],
    [ORDER_STATUS.REFUNDED]: [],
  },
  subscription: {
    [ORDER_STATUS.PENDING_PAYMENT]: [ORDER_STATUS.PAID, ORDER_STATUS.CANCELLED],
    [ORDER_STATUS.PAID]: [ORDER_STATUS.IN_PROGRESS, ORDER_STATUS.CANCELLED, ORDER_STATUS.REFUNDED],
    [ORDER_STATUS.IN_PROGRESS]: [ORDER_STATUS.COMPLETED, ORDER_STATUS.DISPUTED], // 借阅中 → 归还完成 / 纠纷
    [ORDER_STATUS.DISPUTED]: [ORDER_STATUS.COMPLETED, ORDER_STATUS.REFUNDED],
    [ORDER_STATUS.CANCELLED]: [],
    [ORDER_STATUS.COMPLETED]: [],
    [ORDER_STATUS.REFUNDED]: [],
  },
};

export function canTransition(orderType: string, current: string, next: string): boolean {
  const typeTransitions = TRANSITIONS[orderType];
  if (!typeTransitions) return false;
  const allowed = typeTransitions[current];
  if (!allowed) return false;
  return allowed.includes(next);
}

export function getValidTransitions(orderType: string, current: string): string[] {
  const typeTransitions = TRANSITIONS[orderType];
  if (!typeTransitions) return [];
  return typeTransitions[current] ?? [];
}

export function generateOrderNo(): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, "");
  const time = now.toISOString().slice(11, 19).replace(/:/g, "");
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `ORD${date}${time}${rand}`;
}
