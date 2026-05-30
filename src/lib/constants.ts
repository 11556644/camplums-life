// ==================== 订单状态 ====================
export const ORDER_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending_payment: { label: "待支付", color: "bg-yellow-100 text-yellow-800" },
  paid: { label: "已支付", color: "bg-blue-100 text-blue-800" },
  shipped: { label: "已发货", color: "bg-purple-100 text-purple-800" },
  delivered: { label: "已送达", color: "bg-indigo-100 text-indigo-800" },
  in_progress: { label: "进行中", color: "bg-blue-100 text-blue-800" },
  completed: { label: "已完成", color: "bg-green-100 text-green-800" },
  cancelled: { label: "已取消", color: "bg-gray-100 text-gray-800" },
  disputed: { label: "纠纷中", color: "bg-red-100 text-red-800" },
  refunded: { label: "已退款", color: "bg-orange-100 text-orange-800" },
};

// ==================== 商品状态 ====================
export const PRODUCT_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  active: { label: "在售", color: "bg-green-100 text-green-800" },
  sold: { label: "已售", color: "bg-gray-100 text-gray-800" },
  removed: { label: "已下架", color: "bg-red-100 text-red-800" },
  under_review: { label: "审核中", color: "bg-yellow-100 text-yellow-800" },
};

// ==================== 投诉状态 ====================
export const DISPUTE_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: "待处理", color: "bg-yellow-100 text-yellow-800" },
  reviewing: { label: "审核中", color: "bg-blue-100 text-blue-800" },
  resolved: { label: "已解决", color: "bg-green-100 text-green-800" },
  rejected: { label: "已驳回", color: "bg-red-100 text-red-800" },
};

// ==================== 任务类型 ====================
export const TASK_TYPE_LABELS: Record<string, { label: string; icon: string }> = {
  errand: { label: "跑腿", icon: "🏃" },
  delivery: { label: "代取", icon: "📦" },
  tutoring: { label: "辅导", icon: "📖" },
  skill_exchange: { label: "技能交换", icon: "🤝" },
  repair: { label: "维修", icon: "🔧" },
};

// ==================== 商品分类 ====================
export const CATEGORY_LABELS: Record<string, { label: string; icon: string }> = {
  electronics: { label: "数码", icon: "📱" },
  books: { label: "书籍", icon: "📚" },
  furniture: { label: "家居", icon: "🪑" },
  daily: { label: "日用", icon: "🧴" },
  clothing: { label: "服饰", icon: "👕" },
  sports: { label: "运动", icon: "⚽" },
  food: { label: "食品", icon: "🍜" },
  other: { label: "其他", icon: "📦" },
};

// ==================== 教材成色 ====================
export const CONDITION_LABELS: Record<string, string> = {
  new: "全新",
  like_new: "近新",
  good: "良好",
  acceptable: "可用",
};

// ==================== 信用分等级 ====================
export const CREDIT_TIER_LABELS: Record<string, { label: string; color: string }> = {
  excellent: { label: "优秀", color: "text-green-600" },
  good: { label: "良好", color: "text-blue-600" },
  standard: { label: "标准", color: "text-gray-600" },
  probation: { label: "观察", color: "text-orange-600" },
  suspended: { label: "冻结", color: "text-red-600" },
};

// ==================== 快捷文本映射（简化调用） ====================
export function orderStatusLabel(status: string): string {
  return ORDER_STATUS_LABELS[status]?.label || status;
}

export function orderStatusColor(status: string): string {
  return ORDER_STATUS_LABELS[status]?.color || "bg-gray-100 text-gray-800";
}

export function productStatusLabel(status: string): string {
  return PRODUCT_STATUS_LABELS[status]?.label || status;
}

export function disputeStatusLabel(status: string): string {
  return DISPUTE_STATUS_LABELS[status]?.label || status;
}
