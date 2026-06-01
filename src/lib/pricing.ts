/**
 * 校园生活服务平台 — 统一定价配置
 *
 * 定价原则：
 * 1. 低于主流平台抽成，体现校园公益属性
 * 2. 实体商品/体力服务对抽成敏感 → 低抽成
 * 3. 技能类服务价格不确定，对抽成不敏感 → 正常抽成
 * 4. 书籍租赁价上限不超过原价，参考多抓鱼 3-5折定价
 * 5. 智能柜参考丰巢，阶梯定价，4h 免费
 */

// ==================== 平台抽成 ====================

export const COMMISSION_RATES: Record<string, { rate: number; label: string; reason: string }> = {
  // 实体商品交易（闲鱼 0.6%，我们 0.5%）
  product: {
    rate: 0.005,
    label: "商品交易服务费 0.5%",
    reason: "极低费率，为智能柜拉流量，促进闲置流通",
  },
  // 体力跑腿服务（美团抽 15-25%，我们 5%）
  errand: {
    rate: 0.05,
    label: "跑腿服务费 5%",
    reason: "体力服务单价低但频次高，低费率保证服务者积极性",
  },
  // 代取代送（同跑腿）
  delivery: {
    rate: 0.05,
    label: "代取代送服务费 5%",
    reason: "同跑腿，体力服务低费率",
  },
  // 维修服务（58到家抽 10-15%，我们 5%）
  repair: {
    rate: 0.05,
    label: "维修服务费 5%",
    reason: "维修有技术门槛但单价适中，低费率",
  },
  // 技能辅导（主流在线教育平台 20-30%，我们 8%）
  tutoring: {
    rate: 0.08,
    label: "辅导服务费 8%",
    reason: "技能类价格弹性大，对抽成不敏感，适中费率",
  },
  // 技能交换（无主流对标，低费率鼓励交换）
  skill_exchange: {
    rate: 0.06,
    label: "技能交换服务费 6%",
    reason: "技能交换价格不确定，低费率鼓励互助",
  },
  // 书籍借阅（订阅系统内部处理，不额外抽成）
  textbook: {
    rate: 0,
    label: "书籍借阅无额外服务费",
    reason: "订阅套餐已含利润，不重复抽成",
  },
  // 通用默认
  default: {
    rate: 0.05,
    label: "平台服务费 5%",
    reason: "默认低费率",
  },
};

export function getCommission(bizType: string) {
  return COMMISSION_RATES[bizType] || COMMISSION_RATES.default;
}

export function calculateCommission(amount: number, bizType: string): { fee: number; sellerReceives: number; rate: number } {
  const config = getCommission(bizType);
  const fee = Math.round(amount * config.rate * 100) / 100;
  return {
    fee,
    sellerReceives: Math.round((amount - fee) * 100) / 100,
    rate: config.rate,
  };
}

// ==================== 书籍租赁定价 ====================

/**
 * 书籍租赁定价算法（参考 Chegg/Amazon/多抓鱼）
 *
 * 核心逻辑：日费率随租期递减（鼓励长租），总额递增，硬上限=原价
 *
 * 参考数据：
 * - Chegg 学期租 ≈ 原价 40-60%
 * - Amazon 月租 ≈ 原价 15-20%
 * - 多抓鱼 回收1-2折，售3-5折
 *
 * 定价公式：
 * - 第1-30天：日费率 = 原价 × 0.5%/天（月租 ≈ 15%原价）
 * - 第31-90天：日费率 = 原价 × 0.3%/天（月均 ≈ 9%，2个月总 ≈ 24%，3个月总 ≈ 32%）
 * - 第91-120天：日费率 = 原价 × 0.2%/天（4个月总 ≈ 38%）
 * - 第121-365天：日费率 = 原价 × 0.1%/天（1年总 ≈ 62%）
 *
 * 回本分析（以原价68元教材为例）：
 * - 1月租: ¥10 → 7次回本（70元单次租7个月=原价）
 * - 3月租: ¥22 → 3-4次回本
 * - 学期租: ¥26 → 2-3次回本
 * - 年租: ¥42 → 2次回本
 * 书籍生命周期约3年，可循环租6-12次，利润率 100-300%
 */

// 默认书籍原价（当 Textbook 没有 originalPrice 字段时使用）
export const DEFAULT_BOOK_ORIGINAL_PRICE: Record<string, number> = {
  "高等数学": 68, "大学物理": 59, "数据结构": 49, "计算机组成原理": 55,
  "操作系统": 79, "线性代数": 39, "概率论": 42, "信号与系统": 56,
  "电路原理": 52, "Python": 79, "经济学原理": 88, "管理学": 75,
  "人工智能": 45, "机器学习": 65, "百年孤独": 55, "红楼梦": 60,
  "解忧杂货店": 42, "活着": 35, "人类简史": 68, "三体": 93,
  "小王子": 32, "挪威的森林": 38, "时间简史": 45, "围城": 39,
};

export function getBookOriginalPrice(title: string, fallback: number = 50): number {
  for (const [keyword, price] of Object.entries(DEFAULT_BOOK_ORIGINAL_PRICE)) {
    if (title.includes(keyword)) return price;
  }
  return fallback;
}

/**
 * 计算书籍租赁价格（分段日费率递减模型）
 * 硬上限：租赁价绝不超过原价
 */
export function calculateBookRentalPrice(originalPrice: number, rentalDays: number): number {
  let remaining = rentalDays;
  let total = 0;

  // 分段计算：每段日费率递减
  const tiers = [
    { days: 30, dailyRate: 0.005 },   // 1-30天：0.5%/天
    { days: 60, dailyRate: 0.003 },   // 31-90天：0.3%/天
    { days: 30, dailyRate: 0.002 },   // 91-120天：0.2%/天
    { days: 245, dailyRate: 0.001 },  // 121-365天：0.1%/天
  ];

  for (const tier of tiers) {
    if (remaining <= 0) break;
    const daysInTier = Math.min(remaining, tier.days);
    total += originalPrice * tier.dailyRate * daysInTier;
    remaining -= daysInTier;
  }

  // 超过365天的部分，按0.08%/天
  if (remaining > 0) {
    total += originalPrice * 0.0008 * remaining;
  }

  return Math.min(Math.max(1, Math.round(total)), originalPrice);
}

// 成色系数（成色越差，租价越低，参考 Chegg/Amazon 差异化定价）
export const CONDITION_MULTIPLIER: Record<string, { rate: number; label: string }> = {
  new:        { rate: 1.00, label: "全新" },
  like_new:   { rate: 0.85, label: "九成新" },
  good:       { rate: 0.70, label: "良好" },
  acceptable: { rate: 0.55, label: "可接受" },
};

/**
 * 计算含成色的书籍租赁价格
 * 公式：分段日费率 × 原价 × 成色系数，硬上限=原价
 */
export function calculateBookRentalWithCondition(
  originalPrice: number,
  rentalDays: number,
  condition: string = "good",
): number {
  const base = calculateBookRentalPrice(originalPrice, rentalDays);
  const mult = CONDITION_MULTIPLIER[condition]?.rate ?? 0.70;
  return Math.min(Math.max(1, Math.round(base * mult)), originalPrice);
}

// ==================== 智能柜定价 ====================

export const CABINET_PRICING = {
  // 免费时长（30分钟）
  freeMinutes: 30,

  // 阶梯定价：30分钟免费 + 低价补偿 + 特价服务
  tiers: [
    { maxMinutes: 30, price: 0, label: "30分钟内免费" },
    { maxMinutes: 120, price: 0.5, label: "30分钟-2小时 ¥0.5" },
    { maxMinutes: 360, price: 1, label: "2-6小时 ¥1" },
    { maxMinutes: 720, price: 1.5, label: "6-12小时 ¥1.5" },
    { maxMinutes: 1440, price: 2, label: "12-24小时 ¥2" },
    { maxMinutes: 4320, price: 4, label: "1-3天 ¥4" },
    { maxMinutes: 10080, price: 6, label: "3-7天 ¥6" },
    { maxMinutes: Infinity, price: 10, label: "7天以上 ¥10（将通知取回）" },
  ],

  // 闲置/自由市场商品交易特价：2小时内仅 ¥0.2（鼓励面对面交易后存柜）
  marketplaceSpecial: {
    maxMinutes: 120,
    price: 0.2,
    label: "闲置交易特价 2小时 ¥0.2",
    description: "闲置市场和自由市场商品存柜专享",
  },

  // 总封顶
  totalMax: 10,

  // 超时费率（¥0.5/小时，封顶 ¥10）
  overtimeRatePerHour: 0.5,
  overtimeMax: 10,

  // 交易交收时长选项（买家可选）
  tradeDurationOptions: [
    { minutes: 30, label: "30分钟", totalPrice: 0, sellerPays: 0, buyerPays: 0, description: "免费" },
    { minutes: 120, label: "2小时", totalPrice: 0.2, sellerPays: 0.2, buyerPays: 0, description: "特价" },
    { minutes: 360, label: "6小时", totalPrice: 1, sellerPays: 0.2, buyerPays: 0.8, description: "半天" },
    { minutes: 720, label: "12小时", totalPrice: 1.5, sellerPays: 0.2, buyerPays: 1.3, description: "过夜" },
    { minutes: 1440, label: "24小时", totalPrice: 2, sellerPays: 0.2, buyerPays: 1.8, description: "隔天取" },
  ],

  // 存储时长选项（用户可选预付）
  durationOptions: [
    { minutes: 30, label: "30分钟", price: 0, description: "免费" },
    { minutes: 120, label: "2小时", price: 0.5, description: "短时寄存" },
    { minutes: 360, label: "6小时", price: 1, description: "半天寄存" },
    { minutes: 720, label: "12小时", price: 1.5, description: "过夜寄存" },
    { minutes: 1440, label: "1天", price: 2, description: "隔天取" },
    { minutes: 4320, label: "3天", price: 4, description: "周末寄存" },
    { minutes: 10080, label: "7天", price: 6, description: "长假寄存" },
  ],
};

/**
 * 计算智能柜存储费用
 * @param minutes 存储时长（分钟）
 * @param prepaidMinutes 用户预选的时长（0 = 按实际时长算）
 * @param isMarketplace 是否为闲置/自由市场商品（享受特价）
 */
export function calculateCabinetFee(minutes: number, prepaidMinutes: number = 0, isMarketplace: boolean = false): number {
  // 30分钟内免费
  if (minutes <= 30) return 0;

  // 闲置交易特价：2小时内 ¥0.2
  if (isMarketplace && minutes <= 120) {
    return CABINET_PRICING.marketplaceSpecial.price;
  }

  // 如果用户预付了时长，且实际未超时，按预付价
  if (prepaidMinutes > 0 && minutes <= prepaidMinutes) {
    const opt = CABINET_PRICING.durationOptions.find(o => o.minutes === prepaidMinutes);
    return opt?.price ?? 0;
  }

  // 按阶梯计算
  for (const tier of CABINET_PRICING.tiers) {
    if (minutes <= tier.maxMinutes) {
      return Math.min(tier.price, CABINET_PRICING.totalMax);
    }
  }

  return CABINET_PRICING.totalMax;
}

/**
 * 计算交易交收费用分摊
 * 卖家固定付 ¥0.2（2h 特价），超出部分买家付
 * 30 分钟免费档双方都不付
 */
export function calculateTradeDeliveryFee(durationMinutes: number): { sellerPays: number; buyerPays: number } {
  const opt = CABINET_PRICING.tradeDurationOptions.find(o => o.minutes === durationMinutes);
  if (opt) return { sellerPays: opt.sellerPays, buyerPays: opt.buyerPays };
  // 按阶梯计算：找到最近的较大时长档
  const sorted = [...CABINET_PRICING.tradeDurationOptions].sort((a, b) => a.minutes - b.minutes);
  const matched = sorted.find(o => durationMinutes <= o.minutes) || sorted[sorted.length - 1];
  return { sellerPays: matched.sellerPays, buyerPays: matched.buyerPays };
}

/**
 * 计算超时费用
 * 超出预付时长后按 ¥0.5/小时 计费，封顶 ¥10
 */
export function calculateOvertimeFee(overtimeMinutes: number): number {
  if (overtimeMinutes <= 0) return 0;
  const hours = Math.ceil(overtimeMinutes / 60);
  return Math.min(hours * CABINET_PRICING.overtimeRatePerHour, CABINET_PRICING.overtimeMax);
}
