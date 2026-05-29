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

export const COMMISSION_RATES: Record<string, { rate: number; minFee: number; label: string; reason: string }> = {
  // 实体商品交易（闲鱼 0.6%，我们 5%，远低于转转 10%）
  product: {
    rate: 0.05,
    minFee: 0.5,
    label: "商品交易服务费 5%",
    reason: "实体商品有主流价格锚定，抽成敏感，低费率促成交",
  },
  // 体力跑腿服务（美团抽 15-25%，我们 8%）
  errand: {
    rate: 0.08,
    minFee: 0.5,
    label: "跑腿服务费 8%",
    reason: "体力服务单价低但频次高，低费率保证服务者积极性",
  },
  // 代取代送（同跑腿）
  delivery: {
    rate: 0.08,
    minFee: 0.5,
    label: "代取代送服务费 8%",
    reason: "同跑腿，体力服务低费率",
  },
  // 维修服务（58到家抽 10-15%，我们 8%）
  repair: {
    rate: 0.08,
    minFee: 1,
    label: "维修服务费 8%",
    reason: "维修有技术门槛但单价适中，中低费率",
  },
  // 技能辅导（主流在线教育平台 20-30%，我们 10%）
  tutoring: {
    rate: 0.10,
    minFee: 1,
    label: "辅导服务费 10%",
    reason: "技能类价格弹性大，对抽成不敏感，正常费率",
  },
  // 技能交换（无主流对标，低费率鼓励交换）
  skill_exchange: {
    rate: 0.06,
    minFee: 0,
    label: "技能交换服务费 6%",
    reason: "技能交换价格不确定，低费率鼓励互助",
  },
  // 书籍借阅（订阅系统内部处理，不额外抽成）
  textbook: {
    rate: 0,
    minFee: 0,
    label: "书籍借阅无额外服务费",
    reason: "订阅套餐已含利润，不重复抽成",
  },
  // 通用默认
  default: {
    rate: 0.05,
    minFee: 0.5,
    label: "平台服务费 5%",
    reason: "默认低费率",
  },
};

export function getCommission(bizType: string) {
  return COMMISSION_RATES[bizType] || COMMISSION_RATES.default;
}

export function calculateCommission(amount: number, bizType: string): { fee: number; sellerReceives: number; rate: number } {
  const config = getCommission(bizType);
  const fee = Math.max(config.minFee, Math.round(amount * config.rate * 100) / 100);
  return {
    fee,
    sellerReceives: Math.round((amount - fee) * 100) / 100,
    rate: config.rate,
  };
}

// ==================== 书籍租赁定价 ====================

// 租赁月费率占原价比例（参考多抓鱼 3-5折回收再 7-8折出售的利润空间）
export const BOOK_RENTAL_RATES = {
  1: 0.15,   // 1个月：原价 15%
  3: 0.35,   // 3个月（1学期）：原价 35%
  4: 0.40,   // 标准学期（4个月）：原价 40%
  12: 0.60,  // 1学年：原价 60%（长租折扣）
};

// 默认书籍原价（当 Textbook 没有 originalPrice 字段时使用）
export const DEFAULT_BOOK_ORIGINAL_PRICE: Record<string, number> = {
  // 教材类
  "高等数学": 68,
  "大学物理": 59,
  "数据结构": 49,
  "计算机组成原理": 55,
  "操作系统": 79,
  "线性代数": 39,
  "概率论": 42,
  "信号与系统": 56,
  "电路原理": 52,
  "Python": 79,
  "经济学原理": 88,
  "管理学": 75,
  "人工智能": 45,
  "机器学习": 65,
  // 课外经典
  "百年孤独": 55,
  "红楼梦": 60,
  "解忧杂货店": 42,
  "活着": 35,
  "人类简史": 68,
  "三体": 93,
  "小王子": 32,
  "挪威的森林": 38,
  "时间简史": 45,
  "围城": 39,
};

export function getBookOriginalPrice(title: string, fallback: number = 50): number {
  for (const [keyword, price] of Object.entries(DEFAULT_BOOK_ORIGINAL_PRICE)) {
    if (title.includes(keyword)) return price;
  }
  return fallback;
}

/**
 * 计算书籍租赁价格
 * 规则：租赁价 = 原价 × 月费率，且绝对不能超过原价
 */
export function calculateBookRentalPrice(originalPrice: number, rentalDays: number): number {
  // 按月计算，不足1个月按1个月
  const months = Math.ceil(rentalDays / 30);

  // 查找最接近的费率档位
  const rateKeys = Object.keys(BOOK_RENTAL_RATES).map(Number).sort((a, b) => a - b);
  let rate = BOOK_RENTAL_RATES[1]; // 默认1个月费率

  for (const key of rateKeys) {
    if (months >= key) {
      rate = BOOK_RENTAL_RATES[key as keyof typeof BOOK_RENTAL_RATES];
    }
  }

  // 超过12个月的，按比例递减（最多不超过原价 70%）
  if (months > 12) {
    rate = Math.min(0.70, BOOK_RENTAL_RATES[12] * (months / 12) * 0.85);
  }

  const price = Math.round(originalPrice * rate);
  // 硬上限：租赁价绝不超过原价
  return Math.min(price, originalPrice);
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
