import { describe, it, expect } from "vitest";
import { getTier, CREDIT_TIERS, TIER_PERMISSIONS } from "../credit";
import { calculateTradeDeliveryFee, calculateCommission, calculateBookRentalPrice, calculateCabinetFee, calculateOvertimeFee } from "../pricing";

describe("Credit Tiers", () => {
  it("maps score 0 to blacklist", () => {
    expect(getTier(0)).toBe("blacklist");
    expect(getTier(299)).toBe("blacklist");
  });

  it("maps score 300 to restricted", () => {
    expect(getTier(300)).toBe("restricted");
    expect(getTier(449)).toBe("restricted");
  });

  it("maps score 600 to good (default for new users)", () => {
    expect(getTier(600)).toBe("good");
  });

  it("maps score 750+ to excellent", () => {
    expect(getTier(750)).toBe("excellent");
    expect(getTier(1000)).toBe("excellent");
  });

  it("blacklist tier blocks all actions", () => {
    const p = TIER_PERMISSIONS.blacklist;
    expect(p.canPublish).toBe(false);
    expect(p.canBuy).toBe(false);
    expect(p.canBorrow).toBe(false);
  });

  it("excellent tier gets zero deposit multiplier", () => {
    expect(TIER_PERMISSIONS.excellent.depositMultiplier).toBe(0);
  });

  it("all tier boundaries are contiguous", () => {
    const tiers = Object.values(CREDIT_TIERS);
    for (let i = 1; i < tiers.length; i++) {
      expect(tiers[i].min).toBe(tiers[i - 1].max + 1);
    }
  });
});

describe("calculateCommission", () => {
  it("product gets 0.5% rate", () => {
    const r = calculateCommission(100, "product");
    expect(r.rate).toBe(0.005);
    expect(r.fee).toBe(0.5);
    expect(r.sellerReceives).toBe(99.5);
  });

  it("textbook gets 0% rate", () => {
    const r = calculateCommission(100, "textbook");
    expect(r.rate).toBe(0);
    expect(r.fee).toBe(0);
    expect(r.sellerReceives).toBe(100);
  });

  it("unknown bizType falls back to default 5%", () => {
    const r = calculateCommission(100, "unknown_type");
    expect(r.rate).toBe(0.05);
    expect(r.fee).toBe(5);
  });

  it("rounds fee to 2 decimal places", () => {
    const r = calculateCommission(33.33, "errand");
    expect(r.fee).toBe(1.67); // 33.33 * 0.05 = 1.6665 → 1.67
    expect(r.sellerReceives).toBe(31.66);
  });
});

describe("calculateBookRentalPrice", () => {
  it("30 day rental ≈ 15% of original price", () => {
    const price = calculateBookRentalPrice(100, 30);
    expect(price).toBe(15); // 100 * 0.005 * 30
  });

  it("never exceeds original price", () => {
    const price = calculateBookRentalPrice(50, 730);
    expect(price).toBeLessThanOrEqual(50);
  });

  it("minimum price is 1", () => {
    const price = calculateBookRentalPrice(10, 1);
    expect(price).toBeGreaterThanOrEqual(1);
  });

  it("longer rental costs more but with diminishing rate", () => {
    const m1 = calculateBookRentalPrice(100, 30);
    const m3 = calculateBookRentalPrice(100, 90);
    const m4 = calculateBookRentalPrice(100, 120);
    expect(m3).toBeGreaterThan(m1);
    expect(m4).toBeGreaterThan(m3);
    // But the marginal cost of month 4 < month 1
    const marginal4 = m4 - m3;
    expect(marginal4).toBeLessThan(m1);
  });
});

describe("calculateTradeDeliveryFee", () => {
  it("30 minutes is free for both", () => {
    const r = calculateTradeDeliveryFee(30);
    expect(r.sellerPays).toBe(0);
    expect(r.buyerPays).toBe(0);
  });

  it("120 minutes charges seller 0.2", () => {
    const r = calculateTradeDeliveryFee(120);
    expect(r.sellerPays).toBe(0.2);
    expect(r.buyerPays).toBe(0);
  });

  it("180 minutes uses nearest tier (not flat default)", () => {
    // 180 > 120, should match 360 tier: sellerPays=0.2, buyerPays=0.8
    const r = calculateTradeDeliveryFee(180);
    expect(r.sellerPays).toBe(0.2);
    expect(r.buyerPays).toBe(0.8);
  });

  it("600 minutes uses 720 tier", () => {
    const r = calculateTradeDeliveryFee(600);
    expect(r.sellerPays).toBe(0.2);
    expect(r.buyerPays).toBe(1.3);
  });
});

describe("calculateCabinetFee", () => {
  it("30 minutes is free", () => {
    expect(calculateCabinetFee(30)).toBe(0);
    expect(calculateCabinetFee(15)).toBe(0);
  });

  it("31 minutes charges tier 1 (0.5)", () => {
    expect(calculateCabinetFee(31)).toBe(0.5);
  });

  it("marketplace gets special rate under 2 hours", () => {
    expect(calculateCabinetFee(60, 0, true)).toBe(0.2);
  });

  it("caps at totalMax (10)", () => {
    expect(calculateCabinetFee(20000)).toBe(10);
  });

  it("prepaid option honored when not exceeded", () => {
    expect(calculateCabinetFee(60, 120)).toBe(0.5); // prepaid 2h, used 1h → 2h price
  });
});

describe("calculateOvertimeFee", () => {
  it("zero overtime is free", () => {
    expect(calculateOvertimeFee(0)).toBe(0);
    expect(calculateOvertimeFee(-10)).toBe(0);
  });

  it("1 hour overtime = 0.5", () => {
    expect(calculateOvertimeFee(60)).toBe(0.5);
  });

  it("caps at 10", () => {
    expect(calculateOvertimeFee(6000)).toBe(10);
  });

  it("rounds up partial hours", () => {
    expect(calculateOvertimeFee(31)).toBe(0.5); // ceil(31/60) = 1 hour
    expect(calculateOvertimeFee(61)).toBe(1);   // ceil(61/60) = 2 hours
  });
});
