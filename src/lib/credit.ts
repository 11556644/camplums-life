/**
 * 校园信用体系 — 参考芝麻信用分 + 闲鱼信用逻辑
 *
 * 分数范围：0-1000，起点 600
 * 等级：blacklist(0-299) restricted(300-449) standard(450-599) good(600-749) excellent(750-1000)
 *
 * 积分规则：
 *   +5  完成订单（每月上限 20 分）
 *   +3  收到好评（评分 >= 4）
 *   +1  连续 7 天无纠纷
 *   -5  取消订单
 *   -10 逾期还书
 *   -5/-15/-40 书籍损坏（轻微/严重/报废）
 *   -20 输掉纠纷
 *   -10 恶意投诉被驳回
 *
 * 等级影响：
 *   blacklist: 禁止发布、购买、借书
 *   restricted: 禁止发布任务，押金翻倍
 *   standard: 正常权限
 *   good: 优先展示，押金减半
 *   excellent: 优先展示，免押金借书
 */

import { db } from "./db";

export const CREDIT_TIERS = {
  blacklist:  { min: 0,   max: 299, label: "黑名单",  color: "text-red-600" },
  restricted: { min: 300, max: 449, label: "受限",    color: "text-orange-500" },
  standard:   { min: 450, max: 599, label: "标准",    color: "text-gray-500" },
  good:       { min: 600, max: 749, label: "良好",    color: "text-blue-500" },
  excellent:  { min: 750, max: 1000, label: "优秀",   color: "text-green-600" },
} as const;

export type CreditTier = keyof typeof CREDIT_TIERS;

export function getTier(score: number): CreditTier {
  if (score < 300) return "blacklist";
  if (score < 450) return "restricted";
  if (score < 600) return "standard";
  if (score < 750) return "good";
  return "excellent";
}

/** 等级对应的权限 */
export const TIER_PERMISSIONS = {
  blacklist:  { canPublish: false, canBuy: false, canBorrow: false, depositMultiplier: 999 },
  restricted: { canPublish: false, canBuy: true,  canBorrow: true,  depositMultiplier: 2.0 },
  standard:   { canPublish: true,  canBuy: true,  canBorrow: true,  depositMultiplier: 1.0 },
  good:       { canPublish: true,  canBuy: true,  canBorrow: true,  depositMultiplier: 0.5 },
  excellent:  { canPublish: true,  canBuy: true,  canBorrow: true,  depositMultiplier: 0 },
} as const;

/** 获取用户的信用权限 */
export async function getCreditPermissions(userId: string) {
  const cs = await db.creditScore.findUnique({ where: { userId } });
  const score = cs?.score ?? 600;
  const tier = getTier(score);
  return { score, tier, ...TIER_PERMISSIONS[tier] };
}

interface CreditChangeParams {
  userId: string;
  schoolId: string;
  delta: number;
  reason: string;
  source: string;
  orderId?: string;
}

/**
 * 修改信用分（唯一入口）
 * 所有业务方通过此函数修改信用分，保证：
 * 1. 分数范围 0-1000
 * 2. 等级自动更新
 * 3. 变动历史完整记录
 * 4. 月度订单积分上限
 */
export async function changeCredit({ userId, schoolId, delta, reason, source, orderId }: CreditChangeParams) {
  // 月度积分上限检查（仅正向订单积分）
  if (source === "order" && delta > 0) {
    const cs = await db.creditScore.findUnique({ where: { userId } });
    if (cs && cs.monthlyOrders >= 4) return cs.score; // 每月最多 +20（4 × 5）
  }

  const result = await db.$transaction(async (tx: any) => {
    let cs = await tx.creditScore.findUnique({ where: { userId } });
    if (!cs) {
      cs = await tx.creditScore.create({
        data: { userId, schoolId, score: 600, tier: "good", totalOrders: 0, monthlyOrders: 0 },
      });
    }

    const before = cs.score;
    const after = Math.max(0, Math.min(1000, before + delta));
    const newTier = getTier(after);

    await tx.creditScore.update({
      where: { userId },
      data: {
        score: after,
        tier: newTier,
        totalOrders: source === "order" && delta > 0 ? { increment: 1 } : undefined,
        monthlyOrders: source === "order" && delta > 0 ? { increment: 1 } : undefined,
        lastActiveAt: new Date(),
      },
    });

    await tx.creditScoreHistory.create({
      data: {
        userId, schoolId, delta, reason, source,
        orderId: orderId || null,
        scoreBefore: before, scoreAfter: after,
      },
    });

    return after;
  });

  return result;
}

/** 每月初重置月度订单计数（由 cron 或手动调用） */
export async function resetMonthlyCounts() {
  await db.creditScore.updateMany({ data: { monthlyOrders: 0 } });
}

/** 信用恢复：连续 7 天无负面记录的用户 +1（由 cron 调用） */
export async function applyWeeklyRecovery() {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const recentNegative = await db.creditScoreHistory.findMany({
    where: { delta: { lt: 0 }, createdAt: { gte: weekAgo } },
    select: { userId: true },
    distinct: ["userId"],
  });
  const negativeUserIds = new Set(recentNegative.map((r: { userId: string }) => r.userId));

  const allScores = await db.creditScore.findMany({
    where: { score: { lt: 750 }, tier: { not: "blacklist" } },
    select: { id: true, userId: true, schoolId: true, score: true },
  });

  for (const cs of allScores) {
    if (!negativeUserIds.has(cs.userId) && cs.score < 750) {
      await changeCredit({
        userId: cs.userId,
        schoolId: cs.schoolId,
        delta: 1,
        reason: "连续 7 天良好行为",
        source: "system",
      });
    }
  }
}

/** 跑腿类任务执行时限（分钟） */
export const TASK_EXECUTION_LIMITS: Record<string, number> = {
  errand: 120,          // 跑腿：2小时
  delivery: 60,         // 代拿快递：1小时
  tutoring: 120,        // 辅导：2小时（单次）
  skill_exchange: 120,  // 技能交换：2小时
  repair: 240,          // 维修：4小时
  other: 120,
};

/** 计算执行截止时间 */
export function getExecutionDeadline(taskType: string, acceptedAt: Date): Date {
  const minutes = TASK_EXECUTION_LIMITS[taskType] || 120;
  return new Date(acceptedAt.getTime() + minutes * 60 * 1000);
}
