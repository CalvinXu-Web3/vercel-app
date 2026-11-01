import { z } from "zod";

export type Pagination = {
  limit: number;
  offset: number;
};

export function parsePagination(
  request: Request,
  options: { defaultLimit?: number; maxLimit?: number; maxOffset?: number } = {},
): Pagination {
  const defaultLimit = options.defaultLimit ?? 25;
  const maxLimit = options.maxLimit ?? 100;
  const maxOffset = options.maxOffset ?? 10_000;
  const searchParams = new URL(request.url).searchParams;

  return z
    .object({
      limit: z.coerce.number().int().min(1).max(maxLimit).default(defaultLimit),
      offset: z.coerce.number().int().min(0).max(maxOffset).default(0),
    })
    .parse({
      limit: searchParams.get("limit") ?? undefined,
      offset: searchParams.get("offset") ?? undefined,
    });
}
