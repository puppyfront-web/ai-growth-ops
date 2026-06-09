export interface PaginationParams {
  page: number;
  pageSize: number;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * Parse pagination parameters from URL query string.
 * page: 1-based, default 1
 * pageSize: default 20, max 100
 */
export function parsePagination(url: URL): PaginationParams {
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
  const pageSize = Math.min(
    100,
    Math.max(1, Number(url.searchParams.get('pageSize')) || 20)
  );
  return { page, pageSize };
}

/**
 * Helper to build a paginated response from a Prisma query.
 *
 * Usage:
 *   const { page, pageSize } = parsePagination(url);
 *   const result = await paginate(
 *     ctx.db.contentItem,
 *     { organizationId: orgCtx.organization.id, deletedAt: null },
 *     { page, pageSize },
 *     { createdAt: 'desc' }
 *   );
 */
export async function paginate<
  T extends {
    findMany(args: Record<string, unknown>): Promise<unknown[]>;
    count(args: Record<string, unknown>): Promise<number>;
  }
>(
  model: T,
  where: Record<string, unknown>,
  pagination: PaginationParams,
  orderBy: Record<string, 'asc' | 'desc'> | Record<string, 'asc' | 'desc'>[],
  include?: Record<string, unknown>
): Promise<PaginatedResult<unknown>> {
  const skip = (pagination.page - 1) * pagination.pageSize;

  const [items, total] = await Promise.all([
    model.findMany({
      where,
      orderBy,
      skip,
      take: pagination.pageSize,
      ...(include ? { include } : {})
    }),
    model.count({ where })
  ]);

  return {
    items,
    total,
    page: pagination.page,
    pageSize: pagination.pageSize,
    totalPages: Math.ceil(total / pagination.pageSize)
  };
}
