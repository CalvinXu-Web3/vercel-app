import { and, eq, isNotNull, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireContributor } from "@/lib/authorization";
import { db } from "@/db/client";
import { auditLogs, caseRecords, outboxEvents, victimSignatures } from "@/db/schema";
import { errorResponse, HttpError } from "@/lib/http";
import { enforceRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const caseCodeSchema = z.string().trim().min(3).max(64);
const visibilitySchema = z.enum([
  "anonymous_public",
  "alias_public",
  "count_only",
]);

const submissionSchema = z
  .object({
    caseCode: caseCodeSchema,
    visibility: visibilitySchema,
    alias: z.string().trim().min(2).max(48).optional(),
    consent: z.literal(true),
  })
  .superRefine((input, context) => {
    if (input.visibility === "alias_public" && !input.alias) {
      context.addIssue({
        code: "custom",
        path: ["alias"],
        message: "A display alias is required for public alias visibility.",
      });
    }
  });

async function findPublicCase(caseCode: string) {
  const [caseRecord] = await db()
    .select({ id: caseRecords.id })
    .from(caseRecords)
    .where(
      and(
        eq(caseRecords.code, caseCode),
        eq(caseRecords.visibility, "public"),
        isNotNull(caseRecords.currentPublishedVersion),
      ),
    )
    .limit(1);

  if (!caseRecord) {
    throw new HttpError(404, "Public case not found.");
  }

  return caseRecord;
}

function serializeSignature(signature: {
  id: string;
  alias: string | null;
  visibility: "anonymous_public" | "alias_public" | "count_only";
  status: "pending_review" | "approved" | "rejected" | "revoked";
  createdAt: Date;
  reviewedAt: Date | null;
}) {
  return {
    id: signature.id,
    alias: signature.alias,
    visibility: signature.visibility,
    status: signature.status,
    createdAt: signature.createdAt,
    reviewedAt: signature.reviewedAt,
  };
}

export async function GET(request: Request) {
  try {
    const actor = await requireContributor();
    const caseCode = caseCodeSchema.parse(
      new URL(request.url).searchParams.get("caseCode"),
    );
    const caseRecord = await findPublicCase(caseCode);
    const [signature] = await db()
      .select({
        id: victimSignatures.id,
        alias: victimSignatures.alias,
        visibility: victimSignatures.visibility,
        status: victimSignatures.status,
        createdAt: victimSignatures.createdAt,
        reviewedAt: victimSignatures.reviewedAt,
      })
      .from(victimSignatures)
      .where(
        and(
          eq(victimSignatures.caseId, caseRecord.id),
          eq(victimSignatures.signerId, actor.id),
        ),
      )
      .limit(1);

    return NextResponse.json({
      signature: signature ? serializeSignature(signature) : null,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireContributor();
    const input = submissionSchema.parse(await request.json());
    await enforceRateLimit({
      action: "signature.submit",
      subject: `${actor.id}:${input.caseCode}`,
      limit: 10,
      windowSeconds: 3_600,
    });
    const caseRecord = await findPublicCase(input.caseCode);
    const database = db();
    const now = new Date();
    const alias = input.visibility === "alias_public" ? input.alias! : null;
    await database.batch([
      database
        .insert(victimSignatures)
        .values({
          caseId: caseRecord.id,
          signerId: actor.id,
          alias,
          visibility: input.visibility,
          status: "pending_review",
          consentedAt: now,
        })
        .onConflictDoUpdate({
          target: [victimSignatures.caseId, victimSignatures.signerId],
          set: {
            alias,
            visibility: input.visibility,
            status: "pending_review",
            consentedAt: now,
            reviewerId: null,
            reviewedAt: null,
            updatedAt: now,
          },
        }),
      database.insert(auditLogs).values({
        caseId: caseRecord.id,
        actorId: actor.id,
        action: "signature.submitted_or_updated",
        detail: { visibility: input.visibility },
      }),
      database.insert(outboxEvents).values({
        type: "signature.submitted_or_updated",
        aggregateType: "case",
        aggregateId: caseRecord.id,
        payload: { caseId: caseRecord.id, signerId: actor.id },
      }),
    ]);

    const [signature] = await database
      .select({
        id: victimSignatures.id,
        alias: victimSignatures.alias,
        visibility: victimSignatures.visibility,
        status: victimSignatures.status,
        createdAt: victimSignatures.createdAt,
        reviewedAt: victimSignatures.reviewedAt,
      })
      .from(victimSignatures)
      .where(
        and(
          eq(victimSignatures.caseId, caseRecord.id),
          eq(victimSignatures.signerId, actor.id),
        ),
      )
      .limit(1);

    if (!signature) {
      throw new HttpError(500, "Signature could not be saved.");
    }

    return NextResponse.json({ signature: serializeSignature(signature) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const actor = await requireContributor();
    const input = z.object({ caseCode: caseCodeSchema }).parse(await request.json());
    const caseRecord = await findPublicCase(input.caseCode);
    const database = db();
    const [signature] = await database
      .select({
        id: victimSignatures.id,
        status: victimSignatures.status,
        updatedAt: victimSignatures.updatedAt,
      })
      .from(victimSignatures)
      .where(
        and(
          eq(victimSignatures.caseId, caseRecord.id),
          eq(victimSignatures.signerId, actor.id),
        ),
      )
      .limit(1);

    if (!signature || !["pending_review", "approved"].includes(signature.status)) {
      throw new HttpError(409, "There is no active signature to withdraw.");
    }

    const now = new Date();
    const detail = JSON.stringify({
      signatureId: signature.id,
      previousStatus: signature.status,
    });
    const payload = JSON.stringify({ signatureId: signature.id, caseId: caseRecord.id });
    const result = await database.execute<{ id: string }>(sql`
      with updated as (
        update ${victimSignatures}
        set ${victimSignatures.status} = 'revoked', ${victimSignatures.updatedAt} = ${now}
        where
          ${victimSignatures.id} = ${signature.id}
          and ${victimSignatures.status} = ${signature.status}
          and ${victimSignatures.updatedAt} = ${signature.updatedAt}
        returning id
      ), audit as (
        insert into ${auditLogs} (case_id, actor_id, resource_type, resource_id, action, detail)
        select ${caseRecord.id}, ${actor.id}, 'signature', updated.id, 'signature.withdrawn', ${detail}::jsonb
        from updated
      ), outbox as (
        insert into ${outboxEvents} (type, aggregate_type, aggregate_id, payload)
        select 'signature.withdrawn', 'signature', updated.id, ${payload}::jsonb
        from updated
      )
      select id from updated
    `);

    if (result.rows.length === 0) {
      throw new HttpError(409, "The signature status changed. Please refresh and try again.");
    }

    return NextResponse.json({ status: "revoked" });
  } catch (error) {
    return errorResponse(error);
  }
}
