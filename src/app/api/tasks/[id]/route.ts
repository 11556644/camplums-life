import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { apiSuccess, apiError } from "@/lib/api-response";
import { maskLocation } from "@/lib/privacy";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getSession();

  try {
    const task = await db.task.findUnique({
      where: { id },
      include: {
        publisher: { select: { id: true, nickname: true, dormitory: true, department: true } },
        assignee: { select: { id: true, nickname: true, department: true } },
        orderItems: {
          include: {
            order: {
              select: { id: true, orderNo: true, status: true, totalAmount: true, createdAt: true, paidAt: true, buyerId: true, sellerId: true },
            },
          },
          take: 1,
        },
      },
    });
    if (!task) return apiError("任务不存在", 404);

    const isPublisher = session?.userId === task.publisherId;
    const isAssignee = session?.userId === task.assigneeId;
    const masked = {
      ...task,
      location: maskLocation(task.location),
      publisher: {
        ...task.publisher,
        dormitory: isPublisher ? task.publisher.dormitory : maskLocation(task.publisher.dormitory),
      },
      order: task.orderItems[0]?.order || null,
      orderItems: undefined, // 不返回原始 orderItems
    };

    return apiSuccess(masked);
  } catch {
    return apiError("获取任务详情失败", 500);
  }
}
