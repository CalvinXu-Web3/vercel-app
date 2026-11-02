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
      setMessage("人工建档记录已保存并进入审核队列，不会自动公开。");
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
          <span className="section-index">STAFF CASE INTAKE</span>
          <h1>人工录入案件</h1>
          <p>仅用于录入服务邮箱收到且已经完成人工初审的资料。记录默认私有，完成去重、隐私和事实风险复核后，才可转为正式案件。</p>
        </div>
        <Link className="button button-ghost small" href="/workspace/cases">返回案件管理</Link>
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
        <label className="workspace-consent workspace-form-wide"><input name="consent" type="checkbox" required /><span>我确认已核对材料来源及处理授权，并已排除私钥、助记词、密码、无关个人隐私或明知不实的信息。</span></label>
        <div className="workspace-form-actions workspace-form-wide">
          <button className="button button-primary" type="submit" disabled={submitting}>{submitting ? "正在保存…" : "创建待审核记录"}</button>
        </div>
      </form>
    </main>
  );
}
