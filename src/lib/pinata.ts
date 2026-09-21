import { HttpError } from "@/lib/http";

type PinataNetwork = "public" | "private";
type EvidenceStorageMode = "private-ipfs" | "encrypted-public-ipfs";

type EvidenceStoragePolicy = {
  mode: EvidenceStorageMode;
  network: PinataNetwork;
};

function required(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new HttpError(503, `${name} is not configured.`);
  }
  return value;
}

export function getUploadPolicy() {
  const maxBytes = Number(process.env.EVIDENCE_MAX_BYTES ?? 26_214_400);
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new HttpError(503, "EVIDENCE_MAX_BYTES is invalid.");
  }

  const allowedMimeTypes = (process.env.EVIDENCE_ALLOWED_MIME_TYPES ??
    "application/pdf,image/jpeg,image/png,text/plain,application/zip")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  return { maxBytes, allowedMimeTypes };
}

export function getEvidenceStoragePolicy(): EvidenceStoragePolicy {
  const mode = process.env.EVIDENCE_STORAGE_MODE as EvidenceStorageMode | undefined;
  const network = process.env.PINATA_NETWORK as PinataNetwork | undefined;

  if (mode === "private-ipfs" && network === "private") {
    return { mode, network };
  }

  if (mode === "encrypted-public-ipfs" && network === "public") {
    required("NEXT_PUBLIC_EVIDENCE_PUBLIC_KEY_JWK");
    return { mode, network };
  }

  throw new HttpError(
    503,
    "Evidence storage is not configured safely. Use private-ipfs/private or encrypted-public-ipfs/public.",
  );
}

async function pinataFetch(url: string, init: RequestInit) {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    headers: {
      ...init.headers,
      Authorization: `Bearer ${required("PINATA_JWT")}`,
    },
  });
  const payload = (await response.json().catch(() => null)) as
    | { data?: unknown; error?: unknown }
    | null;

  if (!response.ok) {
    console.error("Pinata request failed", {
      status: response.status,
      error: payload?.error ?? null,
    });
    throw new HttpError(502, "The evidence storage provider rejected the request.");
  }

  return payload;
}

export async function createPinataUploadUrl(input: {
  evidenceFileId: string;
  filename: string;
  maxBytes: number;
  network: PinataNetwork;
  mimeTypes: string[];
}) {
  const payload = await pinataFetch("https://uploads.pinata.cloud/v3/files/sign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      network: input.network,
      expires: 300,
      filename: input.filename,
      allow_mime_types: input.mimeTypes,
      max_file_size: input.maxBytes,
      group_id: process.env.PINATA_GROUP_ID || undefined,
      keyvalues: {
        crn_evidence_file_id: input.evidenceFileId,
      },
    }),
  });

  if (!payload || typeof payload.data !== "string") {
    throw new HttpError(502, "The evidence storage provider returned no upload URL.");
  }

  return payload.data;
}

export async function createPrivateAccessLink(cid: string) {
  const gateway = required("PINATA_PRIVATE_GATEWAY_URL").replace(/\/$/, "");
  const payload = await pinataFetch(
    "https://api.pinata.cloud/v3/files/download_link",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: `${gateway}/files/${cid}`,
        expires: 180,
        date: Math.floor(Date.now() / 1000),
        method: "GET",
      }),
    },
  );

  if (!payload || typeof payload.data !== "string") {
    throw new HttpError(502, "The evidence storage provider returned no access link.");
  }

  return payload.data;
}
