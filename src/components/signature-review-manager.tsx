"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type ReviewSignature = {
  id: string;
  caseCode: string;
  alias: string | null;
  visibility: "anonymous_public" | "alias_public" | "count_only";
  status: "pending_review" | "approved" | "rejected" | "revoked";
  createdAt: string;
  reviewedAt: string | null;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function visibilityLabel(visibility: ReviewSignature["visibility"]) {
  return visibility === "alias_public" ? "化名公开" : visibility === "anonymous_public" ? "匿名公开" : "仅计数";
}

async function errorMessage(response: Response) {
  const payload = (await response.json().catch(() => null)) as { error?: string } | null;
  return payload?.error ?? `请求失败（${response.status}）。`;
}

export function SignatureReviewManager({ caseId }: { caseId?: string }) {
  const [signatures, setSignatures] = useState<ReviewSignature[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const query = caseId ? `?caseId=${encodeURIComponent(caseId)}` : "";
      const response = await fetch(`/api/review/signatures${query}`, { cache: "no-store" });
      if (!response.ok) throw new Error(await errorMessage(response));
      const payload = (await response.json()) as { signatures: ReviewSignature[] };
      setSignatures(payload.signatures);
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "无法载入联署审核队列。");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [caseId]);

  const review = async (signatureId: string, action: "approve" | "reject") => {
    setUpdatingId(signatureId);
    try {
      const response = await fetch("/api/review/signatures", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signatureId, action }),
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      const payload = (await response.json()) as { signature: Pick<ReviewSignature, "id" | "status" | "reviewedAt"> };
      setSignatures((current) => current.map((signature) => signature.id === signatureId ? { ...signature, ...payload.signature } : signature));
      setMessage(action === "approve" ? "联署已批准公开规则。" : "联署已标记为不予公开。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "更新联署状态失败。");
    } finally {
      setUpdatingId(null);
    }
  };

  return <main className="review-page">
    <header className="review-page-header">
      <div><span className="section-index">REVIEWER WORKSPACE</span><h1>联署发布管理</h1><p>联署不是证据。只有审核通过的匿名或化名记录可在公开墙中出现；“仅计数”通过后不会展示身份标识。</p></div>
      <div className="review-header-actions">{caseId && <Link className="button button-ghost small" href={`/workspace/cases/${caseId}`}>返回案件</Link>}<Link className="button button-ghost small" href={caseId ? `/review/evidence?caseId=${encodeURIComponent(caseId)}` : "/review/evidence"}>材料审核</Link><button className="button button-ghost small" type="button" onClick={() => void load()} disabled={loading}>刷新队列</button></div>
    </header>
    {message && <p className="review-message" role="status">{message}</p>}
    {loading ? <p className="review-empty">正在读取联署审核队列…</p> : signatures.length === 0 ? <p className="review-empty">当前没有待管理的联署。</p> : <section className="review-list" aria-label="联署审核队列">{signatures.map((signature) => {
      const isUpdating = updatingId === signature.id;
      const pending = signature.status === "pending_review";
      return <article className="review-card" key={signature.id}><div className="review-card-heading"><div><span>{signature.caseCode}</span><h2>{signature.visibility === "alias_public" ? signature.alias || "未提供化名" : visibilityLabel(signature.visibility)}</h2></div><div className="review-state"><span>{signature.status.replaceAll("_", " ")}</span><strong>{visibilityLabel(signature.visibility)}</strong></div></div><dl className="review-meta"><div><dt>提交时间</dt><dd>{formatDate(signature.createdAt)}</dd></div><div><dt>审核时间</dt><dd>{signature.reviewedAt ? formatDate(signature.reviewedAt) : "—"}</dd></div><div><dt>公开方式</dt><dd>{visibilityLabel(signature.visibility)}</dd></div><div><dt>展示内容</dt><dd>{signature.visibility === "alias_public" ? "化名与审核月份" : signature.visibility === "anonymous_public" ? "匿名与审核月份" : "仅公开计数"}</dd></div></dl>{pending && <div className="review-actions"><button className="button button-primary small" type="button" disabled={isUpdating} onClick={() => void review(signature.id, "approve")}>批准</button><button className="review-danger" type="button" disabled={isUpdating} onClick={() => void review(signature.id, "reject")}>不予公开</button></div>}</article>;
    })}</section>}
  </main>;
}
