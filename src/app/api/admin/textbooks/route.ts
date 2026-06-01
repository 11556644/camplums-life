import { db } from "@/lib/db";
import { withAdmin } from "@/lib/api-helpers";
import { auditLog } from "@/lib/logger";
import { apiSuccess, apiError } from "@/lib/api-response";
import { calculateBookRentalPrice, getBookOriginalPrice, CONDITION_MULTIPLIER } from "@/lib/pricing";
import { adminAddTextbookSchema, adminUpdateTextbookSchema } from "@/lib/schemas";
import type { JwtPayload } from "@/lib/auth";

// GET: 管理员查看所有书籍（含算法计算的租赁价）
export const GET = withAdmin(async (_req: Request, session: JwtPayload) => {
  const books = await db.textbook.findMany({
    where: { schoolId: session.schoolId },
    include: {
      copies: { select: { id: true, condition: true, status: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const enriched = books.map((b: any) => {
    const origPrice = b.originalPrice || getBookOriginalPrice(b.title);
    const available = b.copies.filter((c: any) => c.status === "available");
    const conditionOrder = ["new", "like_new", "good", "acceptable"];
    const bestCond = available.length > 0
      ? available.sort((a: any, b: any) => conditionOrder.indexOf(a.condition) - conditionOrder.indexOf(b.condition))[0].condition
      : "good";
    const condMult = CONDITION_MULTIPLIER[bestCond]?.rate ?? 0.70;
    const prices = {
      d30: Math.min(Math.round(calculateBookRentalPrice(origPrice, 30) * condMult), origPrice),
      d90: Math.min(Math.round(calculateBookRentalPrice(origPrice, 90) * condMult), origPrice),
      d120: Math.min(Math.round(calculateBookRentalPrice(origPrice, 120) * condMult), origPrice),
      d365: Math.min(Math.round(calculateBookRentalPrice(origPrice, 365) * condMult), origPrice),
    };
    return {
      ...b,
      originalPrice: origPrice,
      bestCondition: bestCond,
      availableCount: available.length,
      totalCount: b.copies.length,
      rentalPrices: prices,
      copies: undefined,
    };
  });

  return apiSuccess(enriched);
});

// POST: 管理员添加新书
export const POST = withAdmin(async (req: Request, session: JwtPayload) => {
  const body = await req.json();
  const parsed = adminAddTextbookSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0].message);

  const { title, author, isbn, publisher, edition, course, department, isRequired, originalPrice, copyCount } = parsed.data;
  if (!session.schoolId) return apiError("缺少学校信息");

  const existing = await db.textbook.findFirst({
    where: { schoolId: session.schoolId, isbn },
  });
  if (existing) return apiError("该 ISBN 已存在");

  const book = await db.textbook.create({
    data: {
      schoolId: session.schoolId,
      title, author, isbn, publisher,
      edition: edition || null,
      course: course || null,
      department: department || null,
      isRequired: isRequired || false,
      originalPrice,
    },
  });

  // 自动创建副本
  const conditions = ["new", "like_new", "good", "acceptable"];
  for (let i = 1; i <= copyCount; i++) {
    await db.textbookCopy.create({
      data: {
        textbookId: book.id,
        copyNumber: `${isbn}-${String(i).padStart(3, "0")}`,
        condition: conditions[Math.min(i - 1, conditions.length - 1)],
        status: "available",
      },
    });
  }

  await auditLog({
    userId: session.userId,
    action: "textbook_add",
    targetType: "textbook",
    targetId: book.id,
    detail: `上架《${title}》，原价 ¥${originalPrice}，${copyCount} 副本`,
  });

  return apiSuccess(book);
});

// PATCH: 管理员修改书籍信息（原价、上下架）
export const PATCH = withAdmin(async (req: Request, session: JwtPayload) => {
  const body = await req.json();
  const parsed = adminUpdateTextbookSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0].message);

  const { id, originalPrice, status, title, course } = parsed.data;

  const book = await db.textbook.findUnique({ where: { id } });
  if (!book) return apiError("书籍不存在");

  const updateData: Record<string, unknown> = {};
  if (originalPrice !== undefined) updateData.originalPrice = originalPrice;
  if (title !== undefined) updateData.title = title;
  if (course !== undefined) updateData.course = course;

  // 下架：将所有可用副本标记为 retired
  if (status === "removed") {
    await db.textbookCopy.updateMany({
      where: { textbookId: id, status: "available" },
      data: { status: "retired" },
    });
  }
  // 上架：将 retired 副本恢复为 available
  if (status === "active") {
    await db.textbookCopy.updateMany({
      where: { textbookId: id, status: "retired" },
      data: { status: "available" },
    });
  }

  const updated = await db.textbook.update({
    where: { id },
    data: updateData,
  });

  await auditLog({
    userId: session.userId,
    action: "textbook_update",
    targetType: "textbook",
    targetId: id,
    detail: `更新《${book.title}》${originalPrice ? `原价→¥${originalPrice}` : ""} ${status ? `状态→${status}` : ""}`,
  });

  return apiSuccess(updated);
});
