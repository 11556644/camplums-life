/**
 * 搜索工具函数
 *
 * 核心原则：
 * 1. 输入清洗 — 防止 PostgreSQL LIKE 通配符注入
 * 2. 大小写不敏感 — mode: "insensitive"
 * 3. 相关性排序 — 标题匹配 > 描述匹配
 * 4. 防抖 — 减少无效请求
 */

/**
 * 清洗搜索输入
 * 转义 PostgreSQL LIKE 通配符（%、_、\），防止用户输入被当作模式匹配
 */
export function sanitizeSearchQuery(q: string): string {
  return q
    .replace(/\\/g, "\\\\")  // 反斜杠必须最先转义
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_")
    .trim();
}

/**
 * 构建 Prisma 搜索条件
 * 返回已清洗的 where.OR 子句，支持多字段搜索
 */
export function buildSearchFilter(
  q: string,
  fields: { field: string; weight?: number }[]
) {
  const sanitized = sanitizeSearchQuery(q);
  if (!sanitized) return null;

  return {
    OR: fields.map(({ field }) => ({
      [field]: { contains: sanitized, mode: "insensitive" as const },
    })),
  };
}

/**
 * 客户端相关性排序
 * 匹配在标题中的排前面，完全匹配排最前
 */
export function sortByRelevance<T extends Record<string, unknown>>(
  items: T[],
  query: string,
  titleField: string,
  descField?: string
): T[] {
  const q = query.toLowerCase();
  return [...items].sort((a, b) => {
    const aTitle = String(a[titleField] || "").toLowerCase();
    const bTitle = String(b[titleField] || "").toLowerCase();

    // 标题完全匹配 > 标题开头匹配 > 标题包含 > 描述包含
    const score = (title: string, desc?: string) => {
      if (title === q) return 100;
      if (title.startsWith(q)) return 80;
      if (title.includes(q)) return 60;
      if (desc?.toLowerCase().includes(q)) return 30;
      return 0;
    };

    const aDesc = descField ? String(a[descField] || "") : undefined;
    const bDesc = descField ? String(b[descField] || "") : undefined;

    return score(bTitle, bDesc) - score(aTitle, aDesc);
  });
}
