import { createHash } from "node:crypto";

export type PublicCaseSnapshot = {
  case: {
    code: string;
    titleZh: string;
    titleEn: string;
    summaryZh: string | null;
    summaryEn: string | null;
    status: "published";
    updatedAt: string;
    publishedAt: string;
  };
  timeline: Array<{
    id: string;
    occurredAt: string;
    titleZh: string;
    titleEn: string;
    summaryZh: string | null;
    summaryEn: string | null;
  }>;
  entities: Array<{ id: string; type: string; label: string; status: "published" }>;
  relations: Array<{ id: string; fromEntityId: string; toEntityId: string; relationType: string }>;
  wallets: Array<{
    id: string;
    entityId: string | null;
    chain: string;
    label: string;
    explorerUrl: string;
    status: "published";
  }>;
};

export function hashPublicSnapshot(snapshot: PublicCaseSnapshot) {
  return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}

export function isPublicCaseSnapshot(value: unknown): value is PublicCaseSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const caseRecord = record.case;
  return Boolean(
    caseRecord && typeof caseRecord === "object" && !Array.isArray(caseRecord) &&
    typeof (caseRecord as Record<string, unknown>).code === "string" &&
    Array.isArray(record.timeline) && Array.isArray(record.entities) &&
    Array.isArray(record.relations) && Array.isArray(record.wallets),
  );
}
