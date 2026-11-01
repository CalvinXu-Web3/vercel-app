"use client";

import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";

async function responseMessage(response: Response) {
  const payload = (await response.json().catch(() => null)) as { error?: string } | null;
  return payload?.error ?? `请求失败（${response.status}）。`;
}

export function CaseSubmissionForm() {
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [createdId, setCreatedId] = useState<string | null>(null);
  const idempotencyKey = useRef(crypto.randomUUID());

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      const response = await fetch("/api/case-submissions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey.current,
        },
        body: JSON.stringify({
          titleZh: data.get("titleZh"),
          titleEn: data.get("titleEn") || undefined,
          summaryZh: data.get("summaryZh"),
          summaryEn: data.get("summaryEn") || undefined,
          jurisdiction: data.get("jurisdiction") || undefined,
          incidentDate: data.get("incidentDate") || undefined,
          consent: data.get("consent") === "on",
        }),
      });
      if (!response.ok) {
        if (response.status === 409) idempotencyKey.current = crypto.randomUUID();
        throw new Error(await responseMessage(response));
      }
      const payload = (await response.json()) as { submission: { id: string } };
      setCreatedId(payload.submission.id);
      setMessage("案件线索已安全提交，当前仅你本人和审核人员可见。");
      form.reset();
      idempotencyKey.current = crypto.randomUUID();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "案件线索提交失败。");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="review-page workspace-page">
      <header className="review-page-header">
        <div>
          <span className="section-index">PRIVATE CASE INTAKE</span>
          <h1>录入案件线索</h1>
          <p>提交内容默认私有，不会自动出现在公开案件页。审核人员完成去重、隐私和事实风险检查后，才可转为正式案件。</p>
        </div>
        <Link className="button button-ghost small" href="/workspace/cases">返回我的案件</Link>
      </header>
      {message && <p className="review-message" role="status">{message}</p>}
      {createdId && <p className="workspace-reference">提交编号：<code>{createdId}</code></p>}
      <form className="workspace-form" onSubmit={submit}>
        <label>案件标题（中文）<input name="titleZh" minLength={3} maxLength={240} required /></label>
        <label>案件标题（英文，可选）<input name="titleEn" minLength={3} maxLength={240} /></label>
        <label className="workspace-form-wide">案件概述（中文）<textarea name="summaryZh" minLength={20} maxLength={10_000} rows={7} required /></label>
        <label className="workspace-form-wide">案件概述（英文，可选）<textarea name="summaryEn" minLength={20} maxLength={10_000} rows={5} /></label>
        <label>涉及司法辖区（可选）<input name="jurisdiction" maxLength={120} /></label>
        <label>最早事件日期（可选）<input name="incidentDate" type="date" /></label>
        <label className="workspace-consent workspace-form-wide"><input name="consent" type="checkbox" required /><span>我确认有权提交这些信息，并理解不得提交私钥、助记词、密码、无关个人隐私或明知不实的信息。</span></label>
        <div className="workspace-form-actions workspace-form-wide">
          <button className="button button-primary" type="submit" disabled={submitting}>{submitting ? "正在提交…" : "提交私有案件线索"}</button>
        </div>
      </form>
    </main>
  );
}
