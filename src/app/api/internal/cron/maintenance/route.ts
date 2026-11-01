import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { auditLogs, evidenceFiles, evidenceItems, rateLimitBuckets } from "@/db/schema";
import { errorResponse, HttpError } from "@/lib/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const secret = process.env.CRON_SECRET;
    if (!secret) throw new HttpError(503, "Scheduled maintenance is not configured.");
    if (request.headers.get("authorization") !== `Bearer ${secret}`) {
      throw new HttpError(401, "Unauthorized maintenance request.");
    }

    const database = db();
    const now = new Date();
    const uploadCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1_000);
    const staleResult = await database.execute<{ expired_count: number }>(sql`
      with stale_files as (
        update ${evidenceFiles}
        set ${evidenceFiles.status} = 'upload_url_failed'
        where
          ${evidenceFiles.status} = 'pending_upload'
          and ${evidenceFiles.createdAt} < ${uploadCutoff}
        returning ${evidenceFiles.id}, ${evidenceFiles.evidenceId}
      ), stale_items as (
        update ${evidenceItems}
        set ${evidenceItems.status} = 'upload_url_failed', ${evidenceItems.updatedAt} = ${now}
        from stale_files
        where
          ${evidenceItems.id} = stale_files.evidence_id
          and ${evidenceItems.status} = 'pending_upload'
        returning ${evidenceItems.id}, ${evidenceItems.caseId}
      ), audit as (
        insert into ${auditLogs} (case_id, evidence_id, actor_id, resource_type, resource_id, action, detail)
        select stale_items.case_id, stale_items.id, 'system:maintenance', 'evidence', stale_items.id,
          'evidence.upload_intent.expired', jsonb_build_object('cutoff', ${uploadCutoff.toISOString()})
        from stale_items
      )
      select count(*)::int as expired_count from stale_items
    `);
    const pruned = await database
      .delete(rateLimitBuckets)
      .where(sql`${rateLimitBuckets.expiresAt} < ${now}`)
      .returning({ key: rateLimitBuckets.key });

    return NextResponse.json({
      ok: true,
      expiredUploads: staleResult.rows[0]?.expired_count ?? 0,
      prunedRateLimitBuckets: pruned.length,
      completedAt: now,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
