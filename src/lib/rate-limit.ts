import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { rateLimitBuckets } from "@/db/schema";
import { HttpError } from "@/lib/http";

export function buildRateLimitBucket(
  action: string,
  subject: string,
  windowSeconds: number,
  now = new Date(),
) {
  const windowMs = windowSeconds * 1_000;
  const windowStartedAt = new Date(Math.floor(now.getTime() / windowMs) * windowMs);
  const expiresAt = new Date(windowStartedAt.getTime() + windowMs);
  const subjectHash = createHash("sha256").update(subject).digest("hex");
  const key = createHash("sha256")
    .update(`${action}:${subjectHash}:${windowStartedAt.toISOString()}`)
    .digest("hex");
  return { key, subjectHash, windowStartedAt, expiresAt };
}

export async function enforceRateLimit(input: {
  action: string;
  subject: string;
  limit: number;
  windowSeconds: number;
}) {
  const bucket = buildRateLimitBucket(
    input.action,
    input.subject,
    input.windowSeconds,
  );
  const [result] = await db()
    .insert(rateLimitBuckets)
    .values({
      ...bucket,
      action: input.action,
      count: 1,
    })
    .onConflictDoUpdate({
      target: rateLimitBuckets.key,
      set: { count: sql`${rateLimitBuckets.count} + 1` },
    })
    .returning({ count: rateLimitBuckets.count });
  if ((result?.count ?? input.limit + 1) > input.limit) {
    const retryAfter = Math.max(
      1,
      Math.ceil((bucket.expiresAt.getTime() - Date.now()) / 1_000),
    );
    throw new HttpError(429, "Too many requests. Please try again later.", {
      "Retry-After": String(retryAfter),
    });
  }
  return { remaining: Math.max(0, input.limit - result.count), resetAt: bucket.expiresAt };
}
