"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";

type PublicCaseListItem = {
  code: string;
  titleZh: string;
  titleEn: string;
  summaryZh: string | null;
  version: number;
  publishedAt: string;
};

export function PublicCaseDirectory() {
  const [cases, setCases] = useState<PublicCaseListItem[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const load = async (value = "") => {
    setLoading(true);
    try {
      const response = await fetch(`/api/public/cases?limit=50${value ? `&q=${encodeURIComponent(value)}` : ""}`, { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as { cases?: PublicCaseListItem[]; error?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? "无法载入公开案件。");
      setCases(payload?.cases ?? []);
      setMessage("");
    } catch (error) { setMessage(error instanceof Error ? error.message : "无法载入公开案件。"); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);
  const search = (event: FormEvent) => { event.preventDefault(); void load(query.trim()); };

  return (
    <main className="public-directory">
      <header className="public-directory-header"><div><span className="section-index">PUBLIC CASE DIRECTORY</span><h1>公开案件目录</h1><p>仅显示已经完成审核并生成不可变发布版本的案件。</p></div><Link className="button button-ghost small" href="/">返回首页</Link></header>
      <form className="public-case-search" onSubmit={search}><input value={query} maxLength={120} onChange={(event) => setQuery(event.target.value)} placeholder="按案件编号或标题搜索" /><button className="button button-primary small">搜索</button></form>
      {message && <p className="review-message">{message}</p>}
      {loading ? <p className="review-empty">正在读取公开目录…</p> : cases.length === 0 ? <p className="review-empty">没有匹配的公开案件。</p> : <section className="public-case-grid">{cases.map((item) => <Link href={`/cases/${encodeURIComponent(item.code)}`} key={item.code}><article><span>{item.code} · VERSION {item.version}</span><h2>{item.titleZh}</h2><p>{item.summaryZh ?? "暂无公开摘要。"}</p><small>发布于 {new Date(item.publishedAt).toLocaleDateString("zh-CN")}</small></article></Link>)}</section>}
    </main>
  );
}
