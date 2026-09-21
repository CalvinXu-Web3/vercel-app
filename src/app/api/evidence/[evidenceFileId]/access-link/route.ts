import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireReviewer } from "@/lib/authorization";
import { db } from "@/db/client";
import { auditLogs, evidenceFiles, evidenceItems } from "@/db/schema";
import { errorResponse, HttpError } from "@/lib/http";
import { createPrivateAccessLink, getEvidenceStoragePolicy } from "@/lib/pinata";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  _request: Request,
  context: { params: Promise<{ evidenceFileId: string }> },
) {
  try {
    const actor = await requireReviewer();
    const { evidenceFileId } = await context.params;
    const storagePolicy = getEvidenceStoragePolicy();

    if (storagePolicy.mode !== "private-ipfs") {
      throw new HttpError(
        409,
        "Private access links are available only for Pinata Private IPFS. Encrypted public files must be decrypted locally by an authorized reviewer.",
      );
    }

    const database = db();
    const [file] = await database
      .select({
        id: evidenceFiles.id,
        evidenceId: evidenceFiles.evidenceId,
        cid: evidenceFiles.cid,
        status: evidenceFiles.status,
      })
      .from(evidenceFiles)
      .where(eq(evidenceFiles.id, evidenceFileId))
      .limit(1);

    if (!file?.cid || file.status !== "uploaded") {
      throw new HttpError(404, "Uploaded evidence file not found.");
    }

    const [evidence] = await database
      .select({ caseId: evidenceItems.caseId })
      .from(evidenceItems)
      .where(eq(evidenceItems.id, file.evidenceId))
      .limit(1);

    if (!evidence) {
      throw new HttpError(404, "Evidence record not found.");
    }

    const url = await createPrivateAccessLink(file.cid);

    await database.insert(auditLogs).values({
      caseId: evidence.caseId,
      evidenceId: file.evidenceId,
      actorId: actor.id,
      action: "evidence.private_link.issued",
      detail: { evidenceFileId: file.id },
    });

    return NextResponse.json({ url, expiresInSeconds: 180 });
  } catch (error) {
    return errorResponse(error);
  }
}
