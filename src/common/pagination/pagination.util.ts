import { PaginatedResult } from './paginated-result.type';

export interface PaginateOptions {
  page: number;
  limit: number;
}

export interface PaginateSkipTake {
  skip: number;
  take: number;
}

export function paginate(page: number, limit: number): PaginateSkipTake {
  const safePage = Math.max(1, page);
  const safeLimit = Math.max(1, limit);
  return {
    skip: (safePage - 1) * safeLimit,
    take: safeLimit,
  };
}

export function buildPaginatedResult<T>(
  data: T[],
  total: number,
  page: number,
  limit: number,
): PaginatedResult<T> {
  const totalPages = Math.ceil(total / limit);
  return {
    data,
    total,
    page,
    limit,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
  };
}
