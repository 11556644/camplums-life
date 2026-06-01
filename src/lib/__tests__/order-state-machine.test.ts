import { describe, it, expect } from "vitest";
import { canTransition, getValidTransitions, generateOrderNo, ORDER_STATUS } from "../order-state-machine";

describe("canTransition", () => {
  // Product order flow
  it("allows product: pending_payment → paid", () => {
    expect(canTransition("product", ORDER_STATUS.PENDING_PAYMENT, ORDER_STATUS.PAID)).toBe(true);
  });

  it("allows product: paid → shipped", () => {
    expect(canTransition("product", ORDER_STATUS.PAID, ORDER_STATUS.SHIPPED)).toBe(true);
  });

  it("allows product: shipped → delivered", () => {
    expect(canTransition("product", ORDER_STATUS.SHIPPED, ORDER_STATUS.DELIVERED)).toBe(true);
  });

  it("allows product: delivered → completed", () => {
    expect(canTransition("product", ORDER_STATUS.DELIVERED, ORDER_STATUS.COMPLETED)).toBe(true);
  });

  it("blocks product: completed → anything (terminal state)", () => {
    expect(canTransition("product", ORDER_STATUS.COMPLETED, ORDER_STATUS.PAID)).toBe(false);
    expect(canTransition("product", ORDER_STATUS.COMPLETED, ORDER_STATUS.CANCELLED)).toBe(false);
  });

  it("blocks product: cancelled → anything (terminal state)", () => {
    expect(canTransition("product", ORDER_STATUS.CANCELLED, ORDER_STATUS.PAID)).toBe(false);
  });

  it("blocks product: pending_payment → shipped (skip paid)", () => {
    expect(canTransition("product", ORDER_STATUS.PENDING_PAYMENT, ORDER_STATUS.SHIPPED)).toBe(false);
  });

  it("allows product: paid → disputed", () => {
    expect(canTransition("product", ORDER_STATUS.PAID, ORDER_STATUS.DISPUTED)).toBe(true);
  });

  // Task order flow
  it("allows task: pending_payment → paid", () => {
    expect(canTransition("task", ORDER_STATUS.PENDING_PAYMENT, ORDER_STATUS.PAID)).toBe(true);
  });

  it("allows task: paid → in_progress", () => {
    expect(canTransition("task", ORDER_STATUS.PAID, ORDER_STATUS.IN_PROGRESS)).toBe(true);
  });

  it("allows task: in_progress → completed", () => {
    expect(canTransition("task", ORDER_STATUS.IN_PROGRESS, ORDER_STATUS.COMPLETED)).toBe(true);
  });

  it("blocks task: pending_payment → completed (skip steps)", () => {
    expect(canTransition("task", ORDER_STATUS.PENDING_PAYMENT, ORDER_STATUS.COMPLETED)).toBe(false);
  });

  // Subscription flow
  it("allows subscription: paid → in_progress", () => {
    expect(canTransition("subscription", ORDER_STATUS.PAID, ORDER_STATUS.IN_PROGRESS)).toBe(true);
  });

  it("allows subscription: paid → cancelled", () => {
    expect(canTransition("subscription", ORDER_STATUS.PAID, ORDER_STATUS.CANCELLED)).toBe(true);
  });

  // Storage flow
  it("allows storage: paid → stored", () => {
    expect(canTransition("storage", ORDER_STATUS.PAID, ORDER_STATUS.STORED)).toBe(true);
  });

  it("allows storage: stored → retrieved", () => {
    expect(canTransition("storage", ORDER_STATUS.STORED, ORDER_STATUS.RETRIEVED)).toBe(true);
  });

  // Edge cases
  it("returns false for unknown order type", () => {
    expect(canTransition("unknown", ORDER_STATUS.PENDING_PAYMENT, ORDER_STATUS.PAID)).toBe(false);
  });

  it("returns false for unknown current status", () => {
    expect(canTransition("product", "nonexistent", ORDER_STATUS.PAID)).toBe(false);
  });

  it("returns false for unknown target status", () => {
    expect(canTransition("product", ORDER_STATUS.PENDING_PAYMENT, "nonexistent")).toBe(false);
  });
});

describe("getValidTransitions", () => {
  it("returns correct transitions for product pending_payment", () => {
    const result = getValidTransitions("product", ORDER_STATUS.PENDING_PAYMENT);
    expect(result).toContain(ORDER_STATUS.PAID);
    expect(result).toContain(ORDER_STATUS.CANCELLED);
    expect(result).toHaveLength(2);
  });

  it("returns empty array for terminal states", () => {
    expect(getValidTransitions("product", ORDER_STATUS.COMPLETED)).toEqual([]);
    expect(getValidTransitions("product", ORDER_STATUS.CANCELLED)).toEqual([]);
    expect(getValidTransitions("product", ORDER_STATUS.REFUNDED)).toEqual([]);
  });

  it("returns empty array for unknown order type", () => {
    expect(getValidTransitions("unknown", ORDER_STATUS.PENDING_PAYMENT)).toEqual([]);
  });

  it("returns empty array for unknown status", () => {
    expect(getValidTransitions("product", "nonexistent")).toEqual([]);
  });
});

describe("generateOrderNo", () => {
  it("returns string starting with ORD", () => {
    expect(generateOrderNo()).toMatch(/^ORD/);
  });

  it("returns 20-char string (ORD + 8 date + 6 time + 6 rand)", () => {
    const no = generateOrderNo();
    expect(no.length).toBeGreaterThanOrEqual(18);
  });

  it("generates unique numbers", () => {
    const nos = new Set(Array.from({ length: 100 }, () => generateOrderNo()));
    expect(nos.size).toBe(100);
  });
});
