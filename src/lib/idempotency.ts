import { z } from "zod";
import { HttpError } from "@/lib/http";

const keySchema = z.string().uuid();

export function requireIdempotencyKey(request: Request) {
  const result = keySchema.safeParse(request.headers.get("Idempotency-Key"));
  if (!result.success) {
    throw new HttpError(400, "A UUID Idempotency-Key header is required.");
  }
  return result.data;
}
