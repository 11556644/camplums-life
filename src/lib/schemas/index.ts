import { z } from "zod";

// ==================== Chat ====================
export const sendMessageSchema = z.object({
  receiverId: z.string().min(1, "缺少 receiverId"),
  content: z.string().optional(),
  images: z.array(z.string()).optional(),
  orderId: z.string().optional(),
  productId: z.string().optional(),
}).refine(
  (data) => data.content?.trim() || (data.images && data.images.length > 0),
  { message: "消息内容不能为空" }
);

// ==================== Disputes ====================
export const createDisputeSchema = z.object({
  orderId: z.string().min(1, "缺少订单 ID"),
  reason: z.string().min(1, "缺少投诉原因").transform((s) => s.trim()),
  description: z.string().min(1, "缺少投诉描述").transform((s) => s.trim()),
  evidence: z.any().optional(),
});

// ==================== Cabinets ====================
export const cabinetDepositSchema = z.object({
  slotId: z.string().min(1, "缺少柜格 ID"),
  depositType: z.enum(["trade", "storage"]),
  orderId: z.string().optional(),
  photo: z.string().optional(),
  durationMinutes: z.number().int().positive().optional(),
});

export const cabinetRetrieveSchema = z.object({
  pickupCode: z.string().min(1, "请输入取件码"),
  reject: z.boolean().optional(),
});

// ==================== Wallet ====================
export const walletTopupSchema = z.object({
  action: z.literal("topup"),
  amount: z.number().int().min(1).max(1000),
  method: z.enum(["wechat", "alipay"]),
});

export const walletPaySchema = z.object({
  action: z.literal("pay"),
  amount: z.number().positive("支付金额无效"),
  orderId: z.string().min(1, "缺少订单ID"),
});

export const walletRefundSchema = z.object({
  action: z.literal("refund"),
  orderId: z.string().min(1, "缺少订单 ID"),
  amount: z.number().positive("退款金额无效"),
});

// ==================== Admin ====================
export const adminUpdateUserSchema = z.object({
  userId: z.string().min(1, "缺少用户 ID"),
  status: z.enum(["active", "banned", "suspended"]),
});

export const adminAddTextbookSchema = z.object({
  title: z.string().min(1, "缺少书名"),
  author: z.string().min(1, "缺少作者"),
  isbn: z.string().min(1, "缺少 ISBN"),
  publisher: z.string().min(1, "缺少出版社"),
  edition: z.string().optional(),
  course: z.string().optional(),
  department: z.string().optional(),
  isRequired: z.boolean().optional().default(false),
  originalPrice: z.number().positive("请输入有效的原价"),
  copyCount: z.number().int().min(1).max(50).default(2),
});

export const adminUpdateTextbookSchema = z.object({
  id: z.string().min(1, "缺少书籍 ID"),
  originalPrice: z.number().positive().optional(),
  status: z.enum(["active", "removed"]).optional(),
  title: z.string().optional(),
  course: z.string().optional(),
});

export const adminCabinetActionSchema = z.object({
  slotId: z.string().min(1, "缺少柜格 ID"),
  action: z.enum(["release", "fault", "repair", "open"]),
  reason: z.string().optional(),
});

// ==================== Messages ====================
export const markChatReadSchema = z.object({
  senderId: z.string().min(1, "缺少 senderId"),
});

// ==================== Textbooks ====================
export const textbookReturnSchema = z.object({
  copyId: z.string().min(1, "缺少副本ID"),
});

export const textbookRenewSchema = z.object({
  copyId: z.string().min(1, "缺少副本ID"),
  extendDays: z.number().int().refine((v) => [30, 90, 120].includes(v), {
    message: "续借时长仅支持30/90/120天",
  }).default(30),
});

export const textbookAdminActionSchema = z.object({
  copyId: z.string().min(1, "缺少副本ID"),
  action: z.enum(["sanitize", "inspect"]),
  condition: z.string().optional(),
  notes: z.string().optional(),
});

// ==================== Tasks ====================
export const taskCompleteSchema = z.object({
  orderId: z.string().min(1, "缺少订单ID"),
  supplierDone: z.boolean().optional(),
});
