"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";

type SubmissionStatus =
  | "submitted"
  | "triage"
  | "needs_information"
  | "accepted"
  | "rejected"
  | "withdrawn";

type Submission = {
  id: string;
  titleZh: string;
  titleEn: string | null;
  summaryZh: string;
  summaryEn: string | null;
  jurisdiction: string | null;
  incidentStartedAt: string | null;
  status: SubmissionStatus;
  reviewNote: string | null;
  acceptedCaseId: string | null;
  createdAt: string;
  updatedAt: string;
};

type FormalCase = {
  id: string;
  code: string;
  titleZh: string;
  status: string;
  visibility: string;
  organizationName: string;
  updatedAt: string;
};

const statusLabels: Record<SubmissionStatus, string> = {
  submitted: "已提交",
  triage: "初审中",
  needs_information: "待补件",
  accepted: "已接受",
  rejected: "已拒绝",
  withdrawn: "已撤回",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

async function responseMessage(response: Response) {
  const payload = (await response.json().catch(() => null)) as { error?: string } | null;
  return payload?.error ?? `请求失败（${response.status}）。`;
}

function SubmissionCard({
  item,
  reload,
  report,
}: {
  item: Submission;
  reload: () => Promise<void>;
  report: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState({
    titleZh: item.titleZh,
    titleEn: item.titleEn ?? "",
    summaryZh: item.summaryZh,
    summaryEn: item.summaryEn ?? "",
    jurisdiction: item.jurisdiction ?? "",
    incidentDate: item.incidentStartedAt?.slice(0, 10) ?? "",
  });
  const canWithdraw = ["submitted", "triage", "needs_information"].includes(item.status);

  const update = async (action: "resubmit" | "withdraw") => {
    if (action === "withdraw" && !window.confirm("确认撤回这条案件线索？撤回后不能再次提交。")) {
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(`/api/case-submissions/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          action === "resubmit"
            ? {
                action,
                expectedUpdatedAt: item.updatedAt,
                titleZh: draft.titleZh,
                titleEn: draft.titleEn || undefined,
                summaryZh: draft.summaryZh,
                summaryEn: draft.summaryEn || undefined,
                jurisdiction: draft.jurisdiction || undefined,
                incidentDate: draft.incidentDate || undefined,
              }
            : { action, expectedUpdatedAt: item.updatedAt },
        ),
      });
      if (!response.ok) throw new Error(await responseMessage(response));
      report(action === "resubmit" ? "补充信息已重新提交审核。" : "案件线索已撤回。");
      await reload();
    } catch (error) {
      report(error instanceof Error ? error.message : "案件线索更新失败。");
    } finally {
      setBusy(false);
    }
  };

  const resubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void update("resubmit");
  };

  return (
    <article className="review-card">
      <div className="review-card-heading">
        <div><span>{item.id}</span><h2>{item.titleZh}</h2></div>
        <div className="review-state">
          <span>{statusLabels[item.status]}</span>
          <strong>{item.acceptedCaseId ? "已转正式案件" : "私有线索"}</strong>
        </div>
      </div>
      <p className="review-description">{item.summaryZh}</p>
      <dl className="review-meta">
        <div><dt>提交时间</dt><dd>{formatDate(item.createdAt)}</dd></div>
        <div><dt>最后更新</dt><dd>{formatDate(item.updatedAt)}</dd></div>
        <div><dt>司法辖区</dt><dd>{item.jurisdiction ?? "未填写"}</dd></div>
        <div><dt>公开状态</dt><dd>未公开</dd></div>
      </dl>
      {item.reviewNote && (
        <div className="workspace-review-note">
          <strong>审核反馈</strong>
          <p>{item.reviewNote}</p>
        </div>
      )}
      {item.status === "needs_information" && (
        <form className="workspace-followup-form" onSubmit={resubmit}>
          <h3>补充并重新提交</h3>
          <p>请根据审核反馈修订信息。重新提交后会生成新的待审版本，原审核操作保留在审计记录中。</p>
          <label>案件标题（中文）<input required minLength={3} maxLength={240} value={draft.titleZh} onChange={(event) => setDraft({ ...draft, titleZh: event.target.value })} /></label>
          <label>案件标题（英文，可选）<input minLength={3} maxLength={240} value={draft.titleEn} onChange={(event) => setDraft({ ...draft, titleEn: event.target.value })} /></label>
          <label className="workspace-followup-wide">案件概述（中文）<textarea required minLength={20} maxLength={10_000} rows={6} value={draft.summaryZh} onChange={(event) => setDraft({ ...draft, summaryZh: event.target.value })} /></label>
          <label className="workspace-followup-wide">案件概述（英文，可选）<textarea minLength={20} maxLength={10_000} rows={4} value={draft.summaryEn} onChange={(event) => setDraft({ ...draft, summaryEn: event.target.value })} /></label>
          <label>涉及司法辖区（可选）<input minLength={2} maxLength={120} value={draft.jurisdiction} onChange={(event) => setDraft({ ...draft, jurisdiction: event.target.value })} /></label>
          <label>最早事件日期（可选）<input type="date" value={draft.incidentDate} onChange={(event) => setDraft({ ...draft, incidentDate: event.target.value })} /></label>
          <div className="workspace-card-actions workspace-followup-wide">
            <button className="button button-primary small" type="submit" disabled={busy}>{busy ? "正在提交…" : "重新提交审核"}</button>
            <button className="review-danger" type="button" disabled={busy} onClick={() => void update("withdraw")}>撤回线索</button>
          </div>
        </form>
      )}
      {canWithdraw && item.status !== "needs_information" && (
        <div className="workspace-card-actions">
          <button className="review-danger" type="button" disabled={busy} onClick={() => void update("withdraw")}>{busy ? "正在处理…" : "撤回线索"}</button>
        </div>
      )}
    </article>
  );
}

export function CaseSubmissionList() {
  const [items, setItems] = useState<Submission[]>([]);
  const [cases, setCases] = useState<FormalCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const [submissionResponse, caseResponse] = await Promise.all([
        fetch("/api/case-submissions?limit=50", { cache: "no-store" }),
        fetch("/api/cases", { cache: "no-store" }),
      ]);
      const payload = (await submissionResponse.json().catch(() => null)) as { submissions?: Submission[]; error?: string } | null;
      const casePayload = (await caseResponse.json().catch(() => null)) as { cases?: FormalCase[]; error?: string } | null;
      if (!submissionResponse.ok) throw new Error(payload?.error ?? "无法载入案件线索。");
      if (!caseResponse.ok) throw new Error(casePayload?.error ?? "无法载入正式案件。");
      setItems(payload?.submissions ?? []);
      setCases(casePayload?.cases ?? []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "无法载入案件线索。");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  return (
    <main className="review-page workspace-page">
      <header className="review-page-header">
        <div><span className="section-index">MY PRIVATE WORKSPACE</span><h1>我的案件线索</h1><p>这里仅显示你提交的私有案件线索及审核反馈。</p></div>
        <div className="review-header-actions"><Link className="button button-primary small" href="/workspace/cases/new">录入新案件</Link><Link className="button button-ghost small" href="/">返回公开页</Link></div>
      </header>
      {message && <p className="review-message" role="status">{message}</p>}
      {!loading && cases.length > 0 && (
        <section className="workspace-section">
          <h2>可访问的正式案件</h2>
          <div className="workspace-record-list">
            {cases.map((item) => (
              <Link href={`/workspace/cases/${item.id}`} key={item.id}>
                <article><div><strong>{item.code} · {item.titleZh}</strong><span>{item.organizationName} · {item.status.replaceAll("_", " ")} · {formatDate(item.updatedAt)}</span></div></article>
              </Link>
            ))}
          </div>
        </section>
      )}
      {loading ? (
        <p className="review-empty">正在读取…</p>
      ) : items.length === 0 ? (
        <section className="review-empty"><p>尚未录入案件线索。</p><Link className="button button-primary small" href="/workspace/cases/new">开始录入</Link></section>
      ) : (
        <section className="review-list" aria-label="我的案件线索">
          {items.map((item) => <SubmissionCard item={item} key={item.id} reload={load} report={setMessage} />)}
        </section>
      )}
    </main>
  );
}
