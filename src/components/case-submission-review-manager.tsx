"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type ReviewAction = "start_triage" | "request_information" | "accept" | "reject";
type Submission = {
  id: string;
  submitterId: string;
  titleZh: string;
  summaryZh: string;
  jurisdiction: string | null;
  incidentStartedAt: string | null;
  status: "submitted" | "triage" | "needs_information" | "accepted" | "rejected" | "withdrawn";
  reviewNote: string | null;
  acceptedCaseId: string | null;
  createdAt: string;
  updatedAt: string;
};

async function responseMessage(response: Response) {
  const payload = (await response.json().catch(() => null)) as { error?: string } | null;
  return payload?.error ?? `请求失败（${response.status}）。`;
}

export function CaseSubmissionReviewManager() {
  const [items, setItems] = useState<Submission[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/review/case-submissions?limit=50", { cache: "no-store" });
      if (!response.ok) throw new Error(await responseMessage(response));
      const payload = (await response.json()) as { submissions: Submission[] };
      setItems(payload.submissions);
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "无法载入案件审核队列。");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const review = async (item: Submission, action: ReviewAction) => {
    setUpdatingId(item.id);
    try {
      const response = await fetch("/api/review/case-submissions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submissionId: item.id,
          expectedUpdatedAt: item.updatedAt,
          action,
          note: notes[item.id]?.trim() || undefined,
        }),
      });
      if (!response.ok) throw new Error(await responseMessage(response));
      setMessage(action === "accept" ? "已转为正式私有案件。" : "审核状态已更新。");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "审核更新失败。");
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <main className="review-page">
      <header className="review-page-header">
        <div><span className="section-index">CASE TRIAGE</span><h1>案件线索审核</h1><p>线索在转为正式案件前必须完成去重、隐私与事实风险检查；接受操作只生成私有草稿。</p></div>
        <div className="review-header-actions"><Link className="button button-ghost small" href="/workspace">工作台总览</Link><Link className="button button-ghost small" href="/review/evidence">材料审核</Link><button className="button button-ghost small" type="button" onClick={() => void load()} disabled={loading}>刷新队列</button></div>
      </header>
      {message && <p className="review-message" role="status">{message}</p>}
      {loading ? <p className="review-empty">正在读取审核队列…</p> : items.length === 0 ? <p className="review-empty">当前没有案件线索。</p> : (
        <section className="review-list" aria-label="案件线索审核队列">
          {items.map((item) => {
            const terminal = ["accepted", "rejected", "withdrawn"].includes(item.status);
            const awaitingSubmitter = item.status === "needs_information";
            const note = notes[item.id] ?? item.reviewNote ?? "";
            return (
              <article className="review-card" key={item.id}>
                <div className="review-card-heading"><div><span>{item.id}</span><h2>{item.titleZh}</h2></div><div className="review-state"><span>{item.status.replaceAll("_", " ")}</span><strong>{item.jurisdiction ?? "辖区未填"}</strong></div></div>
                <p className="review-description">{item.summaryZh}</p>
                <dl className="review-meta"><div><dt>提交者</dt><dd>{item.submitterId}</dd></div><div><dt>事件日期</dt><dd>{item.incidentStartedAt ? new Date(item.incidentStartedAt).toLocaleDateString("zh-CN") : "未填写"}</dd></div><div><dt>提交时间</dt><dd>{new Date(item.createdAt).toLocaleString("zh-CN")}</dd></div><div><dt>正式案件</dt><dd>{item.acceptedCaseId ?? "尚未创建"}</dd></div></dl>
                {awaitingSubmitter && <p className="workspace-waiting-note">已要求补件，等待提交者修改并重新提交。</p>}
                {!terminal && !awaitingSubmitter && <><label className="review-note-field">审核反馈<textarea rows={3} maxLength={4_000} value={note} onChange={(event) => setNotes((current) => ({ ...current, [item.id]: event.target.value }))} /></label><div className="review-actions"><button className="button button-ghost small" type="button" disabled={updatingId === item.id || item.status === "triage"} onClick={() => void review(item, "start_triage")}>开始初审</button><button className="button button-ghost small" type="button" disabled={updatingId === item.id || note.trim().length === 0} onClick={() => void review(item, "request_information")}>要求补件</button><button className="button button-primary small" type="button" disabled={updatingId === item.id} onClick={() => void review(item, "accept")}>转为私有案件</button><button className="review-danger" type="button" disabled={updatingId === item.id || note.trim().length === 0} onClick={() => void review(item, "reject")}>拒绝</button></div></>}
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}
