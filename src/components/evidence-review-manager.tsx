"use client";

import { useEffect, useState } from "react";

type ReviewAction = "publish" | "restrict" | "reject";

type ReviewEvidence = {
  id: string;
  caseCode: string;
  title: string;
  description: string | null;
  publicTitle: string | null;
  publicDescription: string | null;
  status: "pending_upload" | "upload_url_failed" | "uploaded" | "pending_review" | "approved" | "rejected" | "quarantined";
  visibility: "restricted" | "redacted_public";
  createdAt: string;
  updatedAt: string;
  reviewedAt: string | null;
  fileId: string | null;
  originalFilename: string | null;
  mimeType: string | null;
  originalBytes: number | null;
  storageMode: "private-ipfs" | "encrypted-public-ipfs" | null;
  fileStatus: string | null;
};

type PublicDraft = {
  title: string;
  description: string;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatBytes(value: number | null) {
  if (value === null) return "—";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

async function errorMessage(response: Response) {
  const payload = (await response.json().catch(() => null)) as { error?: string } | null;
  return payload?.error ?? `请求失败（${response.status}）。`;
}

export function EvidenceReviewManager() {
  const [items, setItems] = useState<ReviewEvidence[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, PublicDraft>>({});

  const load = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/review/evidence", { cache: "no-store" });
      if (!response.ok) throw new Error(await errorMessage(response));
      const payload = (await response.json()) as { evidence: ReviewEvidence[] };
      setItems(payload.evidence);
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "无法载入审核队列。");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const update = async (evidenceId: string, action: ReviewAction) => {
    setUpdatingId(evidenceId);
    try {
      const draft = drafts[evidenceId] ?? { title: "", description: "" };
      const response = await fetch("/api/review/evidence", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          evidenceId,
          action,
          ...(action === "publish" ? {
            publicTitle: draft.title,
            publicDescription: draft.description,
          } : {}),
        }),
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      const payload = (await response.json()) as {
        evidence: Pick<ReviewEvidence, "id" | "status" | "visibility" | "publicTitle" | "publicDescription" | "reviewedAt" | "updatedAt">;
      };
      setItems((current) => current.map((item) => (
        item.id === evidenceId ? { ...item, ...payload.evidence } : item
      )));
      setMessage(action === "publish" ? "已发布公开摘要。" : action === "restrict" ? "已撤回至受限审核区。" : "材料已标记为不予发布。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "更新审核状态失败。");
    } finally {
      setUpdatingId(null);
    }
  };

  const openPrivateFile = async (fileId: string) => {
    setUpdatingId(fileId);
    try {
      const response = await fetch(`/api/evidence/${fileId}/access-link`, { method: "POST" });
      if (!response.ok) throw new Error(await errorMessage(response));
      const payload = (await response.json()) as { url: string };
      window.open(payload.url, "_blank", "noopener,noreferrer");
      setMessage("已生成 3 分钟有效的受控访问链接。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "无法获取受控文件。");
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <main className="review-page">
      <header className="review-page-header">
        <div>
          <span className="section-index">REVIEWER WORKSPACE</span>
          <h1>材料发布管理</h1>
          <p>仅可发布经过审核的标题和说明；原始文件、提交者身份及存储标识始终保持受限。</p>
        </div>
        <button className="button button-ghost small" type="button" onClick={() => void load()} disabled={loading}>
          刷新队列
        </button>
      </header>

      {message && <p className="review-message" role="status">{message}</p>}
      {loading ? <p className="review-empty">正在读取审核队列…</p> : items.length === 0 ? <p className="review-empty">当前没有待管理的材料。</p> : (
        <section className="review-list" aria-label="材料审核队列">
          {items.map((item) => {
            const isUpdating = updatingId === item.id || updatingId === item.fileId;
            const canPublish = item.fileStatus === "uploaded" && (item.status === "pending_review" || item.status === "approved");
            const canRestrict = item.status === "approved" && item.visibility === "redacted_public";
            const canReject = item.status === "pending_review" || item.status === "approved";
            const draft = drafts[item.id] ?? {
              title: item.publicTitle ?? "",
              description: item.publicDescription ?? "",
            };
            return (
              <article className="review-card" key={item.id}>
                <div className="review-card-heading">
                  <div>
                    <span>{item.caseCode}</span>
                    <h2>{item.title}</h2>
                  </div>
                  <div className="review-state"><span>{item.status.replaceAll("_", " ")}</span><strong>{item.visibility === "redacted_public" ? "已公开摘要" : "受限"}</strong></div>
                </div>
                {item.description && <p className="review-description">{item.description}</p>}
                <dl className="review-meta">
                  <div><dt>提交时间</dt><dd>{formatDate(item.createdAt)}</dd></div>
                  <div><dt>原始文件</dt><dd>{item.originalFilename ?? "未找到文件"}</dd></div>
                  <div><dt>文件类型 / 大小</dt><dd>{item.mimeType ?? "—"} · {formatBytes(item.originalBytes)}</dd></div>
                  <div><dt>存储方式</dt><dd>{item.storageMode ?? "—"}</dd></div>
                </dl>
                {canPublish && item.visibility !== "redacted_public" && <fieldset className="public-summary-fields"><legend>公开内容（审核员填写）</legend><label htmlFor={`crn-public-title-${item.id}`}>公开标题<input id={`crn-public-title-${item.id}`} value={draft.title} maxLength={240} onChange={(event) => setDrafts((current) => ({ ...current, [item.id]: { ...draft, title: event.target.value } }))} /></label><label htmlFor={`crn-public-description-${item.id}`}>公开摘要（可选）<textarea id={`crn-public-description-${item.id}`} value={draft.description} maxLength={4_000} rows={3} onChange={(event) => setDrafts((current) => ({ ...current, [item.id]: { ...draft, description: event.target.value } }))} /></label></fieldset>}
                <div className="review-actions">
                  {item.fileId && item.storageMode === "private-ipfs" && item.fileStatus === "uploaded" && <button className="button button-ghost small" type="button" disabled={isUpdating} onClick={() => void openPrivateFile(item.fileId!)}>查看受控原件</button>}
                  {item.storageMode === "encrypted-public-ipfs" && <span className="review-file-note">加密文件需使用审核端解密工具查看。</span>}
                  {canPublish && item.visibility !== "redacted_public" && <button className="button button-primary small" type="button" disabled={isUpdating || draft.title.trim().length < 3} onClick={() => void update(item.id, "publish")}>发布摘要</button>}
                  {canRestrict && <button className="button button-ghost small" type="button" disabled={isUpdating} onClick={() => void update(item.id, "restrict")}>撤回公开</button>}
                  {canReject && item.status !== "rejected" && <button className="review-danger" type="button" disabled={isUpdating} onClick={() => void update(item.id, "reject")}>不予发布</button>}
                </div>
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}
