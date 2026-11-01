"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { VictimSignatureWall } from "@/components/victim-signature-wall";

type PublicCasePayload = {
  case: { code: string; titleZh: string; titleEn: string; summaryZh: string | null; summaryEn: string | null; publishedAt: string };
  publication: { version: number; contentHash: string; publishedAt: string };
  timeline: Array<{ id: string; occurredAt: string; titleZh: string; summaryZh: string | null }>;
  entities: Array<{ id: string; type: string; label: string }>;
  relations: Array<{ id: string; fromEntityId: string; toEntityId: string; relationType: string }>;
  wallets: Array<{ id: string; chain: string; label: string; explorerUrl: string }>;
  evidence: Array<{ id: string; title: string; description: string | null; publishedAt: string | null }>;
  approvedSignatureCount: number;
  signatures: Array<{ id: string; alias: string | null; visibility: "anonymous_public" | "alias_public"; approvedAt: string | null }>;
};

export function PublicCaseDetail({ caseCode }: { caseCode: string }) {
  const [data, setData] = useState<PublicCasePayload | null>(null);
  const [message, setMessage] = useState("");
  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/public/cases/${encodeURIComponent(caseCode)}`, { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as PublicCasePayload & { error?: string };
      if (!response.ok) throw new Error(payload?.error ?? "公开案件不存在。");
      setData(payload);
      setMessage("");
    } catch (error) { setMessage(error instanceof Error ? error.message : "无法载入公开案件。"); }
  }, [caseCode]);
  useEffect(() => { void load(); }, [load]);

  if (!data) return <main className="public-directory"><Link className="button button-ghost small" href="/cases">返回案件目录</Link><p className={message ? "review-message" : "review-empty"}>{message || "正在读取发布快照…"}</p></main>;
  const labels = new Map(data.entities.map((item) => [item.id, item.label]));
  return (
    <main className="public-case-detail">
      <header className="public-case-hero"><div><span className="section-index">{data.case.code} · VERSION {data.publication.version}</span><h1>{data.case.titleZh}</h1><p>{data.case.summaryZh ?? "暂无公开摘要。"}</p></div><div className="review-header-actions"><Link className="button button-ghost small" href="/cases">案件目录</Link><Link className="button button-ghost small" href="/">首页</Link></div></header>
      <div className="public-publication-proof"><span>发布快照哈希</span><code>{data.publication.contentHash}</code><small>{new Date(data.publication.publishedAt).toLocaleString("zh-CN")}</small></div>
      <section className="public-case-section"><h2>案件时间线</h2>{data.timeline.length ? <div className="public-timeline">{data.timeline.map((item) => <article key={item.id}><time>{new Date(item.occurredAt).toLocaleDateString("zh-CN")}</time><div><h3>{item.titleZh}</h3><p>{item.summaryZh}</p></div></article>)}</div> : <p className="review-empty">本版本未发布公开时间线。</p>}</section>
      <section className="public-case-section"><h2>人物与实体关系</h2><div className="public-entity-grid">{data.entities.map((item) => <article key={item.id}><span>{item.type}</span><strong>{item.label}</strong></article>)}</div>{data.relations.map((item) => <p className="public-relation" key={item.id}>{labels.get(item.fromEntityId) ?? "未知实体"} → {item.relationType} → {labels.get(item.toEntityId) ?? "未知实体"}</p>)}</section>
      <section className="public-case-section"><h2>公开链上引用</h2><div className="public-wallet-grid">{data.wallets.map((item) => <a href={item.explorerUrl} target="_blank" rel="noopener noreferrer" key={item.id}><span>{item.chain}</span><strong>{item.label}</strong><i>↗</i></a>)}</div></section>
      <section className="public-case-section"><h2>公开材料摘要</h2>{data.evidence.length ? data.evidence.map((item) => <article className="public-evidence-card" key={item.id}><h3>{item.title}</h3><p>{item.description}</p></article>) : <p className="review-empty">当前没有公开材料摘要。</p>}</section>
      <section className="public-case-section"><VictimSignatureWall caseCode={caseCode} locale="zh" approvedCount={data.approvedSignatureCount} signatures={data.signatures} onChanged={() => { void load(); }} /></section>
    </main>
  );
}
