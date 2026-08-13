export interface PaginationInput {
  page?: number;
  limit?: number;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}

export const MAX_LIMIT = 100;
export const DEFAULT_LIMIT = 20;

export function clampPagination(input: PaginationInput): {
  page: number;
  limit: number;
  offset: number;
} {
  const page = Math.max(1, Math.floor(input.page ?? 1));
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Math.floor(input.limit ?? DEFAULT_LIMIT)),
  );
  return { page, limit, offset: (page - 1) * limit };
}

export function buildPagination(
  page: number,
  limit: number,
  total: number,
): Pagination {
  return { page, limit, total, total_pages: Math.ceil(total / limit) };
}
