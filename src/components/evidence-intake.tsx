"use client";

import { ChangeEvent, FormEvent, useState } from "react";
import {
  SignInButton,
  Show,
  UserButton,
} from "@clerk/nextjs";

type Locale = "zh" | "en";
type StorageMode = "private-ipfs" | "encrypted-public-ipfs";

type EncryptionMetadata = {
  algorithm: "AES-256-GCM";
  ivBase64: string;
  encryptedDekBase64: string;
};

type PreparedUpload = {
  file: File;
  contentSha256: string;
  encryption?: EncryptionMetadata;
};

const labels = {
  zh: {
    title: "材料标题",
    description: "简要说明（可选）",
    file: "选择文件",
    submit: "提交受控材料",
    signIn: "登录后提交材料",
    idle: "仅登录用户可创建提交；材料会先进入审核队列。",
    preparing: "正在本地准备加密文件…",
    uploading: "正在直传至 Pinata…",
    success: "材料已提交，当前状态：等待审核。",
  },
  en: {
    title: "Evidence title",
    description: "Brief description (optional)",
    file: "Choose file",
    submit: "Submit controlled evidence",
    signIn: "Sign in to submit evidence",
    idle: "Only signed-in users can submit. Material enters the review queue first.",
    preparing: "Preparing the encrypted file locally…",
    uploading: "Uploading directly to Pinata…",
    success: "Evidence submitted. Current status: pending review.",
  },
} as const;

function toBase64(bytes: ArrayBuffer) {
  const view = new Uint8Array(bytes);
  let binary = "";
  const chunkSize = 0x8000;

  for (let index = 0; index < view.length; index += chunkSize) {
    binary += String.fromCharCode(...view.subarray(index, index + chunkSize));
  }

  return btoa(binary);
}

async function sha256(file: File) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

async function encryptForPublicIpfs(
  file: File,
  publicKeyJwk: string,
): Promise<PreparedUpload> {
  const source = await file.arrayBuffer();
  const contentSha256 = await sha256(file);
  const contentKey = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    contentKey,
    source,
  );
  const recipientKey = await crypto.subtle.importKey(
    "jwk",
    JSON.parse(publicKeyJwk),
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["encrypt"],
  );
  const rawContentKey = await crypto.subtle.exportKey("raw", contentKey);
  const encryptedDek = await crypto.subtle.encrypt(
    { name: "RSA-OAEP" },
    recipientKey,
    rawContentKey,
  );
  const uploadName = `evidence-${crypto.randomUUID()}.bin`;

  return {
    file: new File([encrypted], uploadName, {
      type: "application/octet-stream",
    }),
    contentSha256,
    encryption: {
      algorithm: "AES-256-GCM",
      ivBase64: toBase64(iv.buffer),
      encryptedDekBase64: toBase64(encryptedDek),
    },
  };
}

function readPinataUploadResult(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    throw new Error("Pinata returned an invalid upload response.");
  }

  const data =
    "data" in payload && payload.data && typeof payload.data === "object"
      ? payload.data
      : payload;

  if (!data || typeof data !== "object") {
    throw new Error("Pinata returned no upload data.");
  }

  const record = data as Record<string, unknown>;
  const cid = record.cid ?? record.Cid ?? record.IpfsHash;
  const pinataFileId = record.id ?? record.file_id;

  if (typeof cid !== "string") {
    throw new Error("Pinata did not return a CID.");
  }

  return {
    cid,
    pinataFileId: typeof pinataFileId === "string" ? pinataFileId : undefined,
  };
}

async function responseMessage(response: Response) {
  const payload = (await response.json().catch(() => null)) as
    | { error?: string }
    | null;
  return payload?.error ?? `Request failed (${response.status}).`;
}

export function EvidenceIntake({
  locale,
  caseCode,
}: {
  locale: Locale;
  caseCode: string;
}) {
  const t = labels[locale];
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<string>(t.idle);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    setFile(event.target.files?.[0] ?? null);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!file || !title.trim()) {
      setStatus(locale === "zh" ? "请填写标题并选择文件。" : "Enter a title and choose a file.");
      return;
    }

    setIsSubmitting(true);
    try {
      const storageMode = process.env
        .NEXT_PUBLIC_EVIDENCE_STORAGE_MODE as StorageMode | undefined;
      let prepared: PreparedUpload;

      if (storageMode === "encrypted-public-ipfs") {
        const publicKey = process.env.NEXT_PUBLIC_EVIDENCE_PUBLIC_KEY_JWK;
        if (!publicKey) {
          throw new Error(
            locale === "zh"
              ? "缺少证据公钥配置，无法安全上传。"
              : "The evidence public key is not configured.",
          );
        }
        setStatus(t.preparing);
        prepared = await encryptForPublicIpfs(file, publicKey);
      } else if (storageMode === "private-ipfs") {
        prepared = { file, contentSha256: await sha256(file) };
      } else {
        throw new Error(
          locale === "zh"
            ? "证据存储模式尚未配置。"
            : "Evidence storage mode is not configured.",
        );
      }

      const intentResponse = await fetch("/api/evidence/upload-intents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caseCode,
          title: title.trim(),
          description: description.trim() || undefined,
          originalFilename: file.name,
          mimeType: prepared.file.type,
          originalBytes: file.size,
          uploadFilename: prepared.file.name,
          uploadBytes: prepared.file.size,
          contentSha256: prepared.contentSha256,
          encryption: prepared.encryption,
        }),
      });

      if (!intentResponse.ok) {
        throw new Error(await responseMessage(intentResponse));
      }

      const intent = (await intentResponse.json()) as {
        evidenceFileId: string;
        uploadUrl: string;
        pinataNetwork: "public" | "private";
      };

      setStatus(t.uploading);
      const formData = new FormData();
      formData.append("file", prepared.file);
      formData.append("network", intent.pinataNetwork);

      const pinataResponse = await fetch(intent.uploadUrl, {
        method: "POST",
        body: formData,
      });

      if (!pinataResponse.ok) {
        throw new Error(await responseMessage(pinataResponse));
      }

      const upload = readPinataUploadResult(await pinataResponse.json());
      const completionResponse = await fetch("/api/evidence/upload-complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          evidenceFileId: intent.evidenceFileId,
          cid: upload.cid,
          pinataFileId: upload.pinataFileId,
        }),
      });

      if (!completionResponse.ok) {
        throw new Error(await responseMessage(completionResponse));
      }

      setStatus(t.success);
      setFile(null);
      setTitle("");
      setDescription("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unexpected upload error.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div id="crn-evidence-auth-gate">
      <Show when="signed-out">
        <div id="crn-evidence-sign-in-panel" className="sign-in-panel">
          <p id="crn-evidence-sign-in-note" className="form-status">
            {t.idle}
          </p>
          <SignInButton mode="modal">
            <button
              id="crn-evidence-sign-in"
              className="primary-button"
              type="button"
            >
              {t.signIn}
            </button>
          </SignInButton>
        </div>
      </Show>

      <Show when="signed-in">
        <div id="crn-evidence-user-bar" className="evidence-user-bar">
          <UserButton />
        </div>
        <form id="crn-evidence-form" className="evidence-form" onSubmit={submit}>
          <label id="crn-evidence-title-label" htmlFor="crn-evidence-title-input">
            {t.title}
          </label>
          <input
            id="crn-evidence-title-input"
            value={title}
            maxLength={240}
            onChange={(event) => setTitle(event.target.value)}
            required
          />

          <label id="crn-evidence-description-label" htmlFor="crn-evidence-description-input">
            {t.description}
          </label>
          <textarea
            id="crn-evidence-description-input"
            value={description}
            maxLength={4_000}
            onChange={(event) => setDescription(event.target.value)}
            rows={4}
          />

          <label id="crn-evidence-file-label" htmlFor="crn-evidence-file-input">
            {t.file}
          </label>
          <input
            id="crn-evidence-file-input"
            type="file"
            onChange={handleFile}
            required
          />

          <button
            id="crn-evidence-submit"
            className="primary-button"
            disabled={isSubmitting}
            type="submit"
          >
            {isSubmitting ? t.uploading : t.submit}
          </button>
          <p id="crn-evidence-status" className="form-status" role="status">
            {status}
          </p>
        </form>
      </Show>
    </div>
  );
}
