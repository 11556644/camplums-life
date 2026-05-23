import { db } from "./db";

type LogLevel = "info" | "warn" | "error" | "debug";

interface LogEntry {
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
  traceId?: string;
  requestId?: string;
}

function formatLog(entry: LogEntry): string {
  return JSON.stringify({
    timestamp: new Date().toISOString(),
    ...entry,
  });
}

export const logger = {
  info(message: string, context?: Record<string, unknown>) {
    console.log(formatLog({ level: "info", message, context }));
  },
  warn(message: string, context?: Record<string, unknown>) {
    console.warn(formatLog({ level: "warn", message, context }));
  },
  error(message: string, context?: Record<string, unknown>) {
    console.error(formatLog({ level: "error", message, context }));
  },
  debug(message: string, context?: Record<string, unknown>) {
    if (process.env.NODE_ENV === "development") {
      console.debug(formatLog({ level: "debug", message, context }));
    }
  },
};

// 审计日志：记录所有关键操作
export async function auditLog(params: {
  userId?: string;
  schoolId?: string;
  action: string;
  targetType?: string;
  targetId?: string;
  detail?: string;
  ip?: string;
}) {
  // 自动推断 schoolId：从 userId 查，或使用默认学校
  let schoolId = params.schoolId;
  if (!schoolId && params.userId) {
    const user = await db.user.findUnique({ where: { id: params.userId }, select: { schoolId: true } });
    schoolId = user?.schoolId;
  }
  if (!schoolId) schoolId = "school_001";

  try {
    await db.auditLog.create({
      data: {
        userId: params.userId,
        schoolId,
        action: params.action,
        targetType: params.targetType,
        targetId: params.targetId,
        detail: params.detail,
        ip: params.ip,
      },
    });
    logger.debug("Audit log recorded", { action: params.action, targetType: params.targetType });
  } catch (error) {
    logger.error("Failed to write audit log", { error: String(error), ...params });
  }
}

// 领域事件：记录所有状态变更
export async function domainEvent(params: {
  schoolId?: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload?: Record<string, unknown>;
}) {
  const schoolId = params.schoolId || "school_001";

  try {
    await db.eventLog.create({
      data: {
        schoolId,
        eventType: params.eventType,
        aggregateType: params.aggregateType,
        aggregateId: params.aggregateId,
        payload: params.payload ? JSON.stringify(params.payload) : null,
      },
    });
    logger.debug("Domain event recorded", { eventType: params.eventType });
  } catch (error) {
    logger.error("Failed to write domain event", { error: String(error), ...params });
  }
}
