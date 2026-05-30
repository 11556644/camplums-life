import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { auditLog } from "@/lib/logger";
import { apiSuccess, apiError } from "@/lib/api-response";
import { calculateBookRentalPrice, getBookOriginalPrice, CONDITION_MULTIPLIER } from "@/lib/pricing";

// GET: 管理员查看所有书籍（含算法计算的租赁价）
export async function GET() {
  const session = await getSession();
  if (!session) return apiError("请先登录", 401);
  const user = await db.user.findUnique({ where: { id: session.userId }, include: { roles: true } });
  if (!user?.roles.some((r: { role: string }) => r.role === "admin")) return apiError("仅管理员可操作", 403);

  try {
    const books = await db.textbook.findMany({
      where: { schoolId: user.schoolId },
      include: {
        copies: { select: { id: true, condition: true, status: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const enriched = books.map((b: any) => {
      const origPrice = b.originalPrice || getBookOriginalPrice(b.title);
      const available = b.copies.filter((c: any) => c.status === "available");
      // 算法计算各租期的参考价（取 best condition）
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
        copies: undefined, // 不返回副本详情给列表
      };
    });

    return apiSuccess(enriched);
  } catch {
    return apiError("获取书籍列表失败", 500);
  }
}

// POST: 管理员添加新书
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return apiError("请先登录", 401);
  const user = await db.user.findUnique({ where: { id: session.userId }, include: { roles: true } });
  if (!user?.roles.some((r: { role: string }) => r.role === "admin")) return apiError("仅管理员可操作", 403);

  const body = await req.json();
  const { title, author, isbn, publisher, edition, course, department, isRequired, originalPrice, copyCount = 2 } = body;

  if (!title || !author || !isbn || !publisher) return apiError("书名、作者、ISBN、出版社为必填");
  if (!originalPrice || originalPrice <= 0) return apiError("请输入有效的原价");

  try {
    const existing = await db.textbook.findFirst({
      where: { schoolId: user.schoolId, isbn },
    });
    if (existing) return apiError("该 ISBN 已存在");

    const book = await db.textbook.create({
      data: {
        schoolId: user.schoolId,
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
  } catch {
    return apiError("添加书籍失败", 500);
  }
}

// PATCH: 管理员修改书籍信息（原价、上下架）
export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) return apiError("请先登录", 401);
  const user = await db.user.findUnique({ where: { id: session.userId }, include: { roles: true } });
  if (!user?.roles.some((r: { role: string }) => r.role === "admin")) return apiError("仅管理员可操作", 403);

  const body = await req.json();
  const { id, originalPrice, status, title, course } = body;
  if (!id) return apiError("缺少书籍 ID");

  try {
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
  } catch {
    return apiError("更新失败", 500);
  }
}
