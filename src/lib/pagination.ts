interface PaginateOptions {
  page?: number;
  limit?: number;
  maxLimit?: number;
}

interface PaginateResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export function parsePagination(searchParams: URLSearchParams, maxLimit = 50): { page: number; limit: number } {
  const page = Math.max(1, parseInt(searchParams.get("page") || "1") || 1);
  const limit = Math.min(maxLimit, Math.max(1, parseInt(searchParams.get("limit") || "20") || 20));
  return { page, limit };
}

export async function paginate<T>(
  model: { findMany: (args: any) => Promise<T[]>; count: (args: any) => Promise<number> },
  args: { where?: any; include?: any; select?: any; orderBy?: any },
  options: PaginateOptions = {}
): Promise<PaginateResult<T>> {
  const page = options.page ?? 1;
  const limit = Math.min(options.maxLimit ?? 50, options.limit ?? 20);
  const skip = (page - 1) * limit;

  const [data, total] = await Promise.all([
    model.findMany({ ...args, skip, take: limit }),
    model.count({ where: args.where }),
  ]);

  return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
}
