"use client";

import { useMemo, useState } from "react";
import { EvidenceIntake } from "@/components/evidence-intake";

type Locale = "zh" | "en";

const copy = {
  zh: {
    localeName: "English",
    archive: "公开案件档案",
    caseCode: "案件编号",
    title: "CRN — 案件与追偿网络",
    intro:
      "公开档案仅展示经审核且适合公开的信息。原始材料在受控证据流程中单独处理。",
    timeline: "案件时间线",
    timelineCaption: "以下条目仅作为待核实的公开线索索引，不替代司法或专业调查结论。",
    evidence: "受控证据提交",
    architecture: "Vercel · Neon PostgreSQL · Pinata",
    migration: "React 迁移预览",
    currentSite: "当前静态站继续保留，直至迁移验收完成。",
    footer: "公开材料应遵守适用法律、隐私与平台规则。",
  },
  en: {
    localeName: "中文",
    archive: "Public case archive",
    caseCode: "Case ID",
    title: "CRN — Case & Recovery Network",
    intro:
      "The public archive contains only reviewed, publishable information. Original material is handled separately through the controlled-evidence flow.",
    timeline: "Case timeline",
    timelineCaption:
      "Entries below are an index of leads pending verification. They are not judicial findings or investigative conclusions.",
    evidence: "Controlled evidence intake",
    architecture: "Vercel · Neon PostgreSQL · Pinata",
    migration: "React migration preview",
    currentSite: "The current static site remains in place until the migration is accepted.",
    footer: "Public material must comply with applicable law, privacy, and platform rules.",
  },
} as const;

const events = [
  {
    date: "2026-06-27",
    zh: "相关行程线索被记录，待与原始材料交叉核验。",
    en: "A travel-related lead was logged for cross-checking against source material.",
  },
  {
    date: "2026-07-01",
    zh: "失联时间点被记录为待核实的案件事件。",
    en: "A reported loss-of-contact point was recorded as an event pending verification.",
  },
  {
    date: "2026-07-03",
    zh: "出现相互矛盾的信息与地址线索，进入证据审核队列。",
    en: "Conflicting information and an address lead entered the evidence-review queue.",
  },
  {
    date: "2026-07-12",
    zh: "公开通讯内容被作为时间线线索留档，尚未作为事实认定。",
    en: "Public communications were indexed as a timeline lead, not treated as a factual finding.",
  },
  {
    date: "2026-08-02",
    zh: "一项出境相关线索被纳入后续核验范围。",
    en: "An exit-travel lead was added for subsequent verification.",
  },
];

export function CaseArchive() {
  const [locale, setLocale] = useState<Locale>("zh");
  const t = copy[locale];
  const caseCode = useMemo(() => "CRN-2026-0703", []);

  return (
    <main id="crn-main-archive" className="page-shell">
      <header id="crn-site-header" className="site-header">
        <a id="crn-brand-link" className="brand" href="#crn-main-archive">
          <span aria-hidden="true" className="brand-mark">
            CRN
          </span>
          <span>Case &amp; Recovery Network</span>
        </a>
        <button
          id="crn-language-toggle"
          className="language-toggle"
          type="button"
          onClick={() => setLocale(locale === "zh" ? "en" : "zh")}
        >
          {t.localeName}
        </button>
      </header>

      <section id="crn-case-overview" className="case-overview" aria-labelledby="crn-title">
        <p id="crn-migration-badge" className="eyebrow">
          {t.migration}
        </p>
        <p id="crn-archive-label" className="section-label">
          {t.archive}
        </p>
        <h1 id="crn-title">{t.title}</h1>
        <p id="crn-case-summary" className="lede">
          {t.intro}
        </p>
        <dl id="crn-case-meta" className="case-meta">
          <div id="crn-case-code-row">
            <dt id="crn-case-code-label">{t.caseCode}</dt>
            <dd id="crn-case-code-value">{caseCode}</dd>
          </div>
          <div id="crn-architecture-row">
            <dt id="crn-architecture-label">Architecture</dt>
            <dd id="crn-architecture-value">{t.architecture}</dd>
          </div>
        </dl>
      </section>

      <section id="crn-timeline-section" className="content-section" aria-labelledby="crn-timeline-title">
        <div id="crn-timeline-heading-group" className="section-heading">
          <p id="crn-timeline-label" className="section-label">
            {t.archive}
          </p>
          <h2 id="crn-timeline-title">{t.timeline}</h2>
          <p id="crn-timeline-caption" className="muted">
            {t.timelineCaption}
          </p>
        </div>
        <ol id="crn-timeline-list" className="timeline-list">
          {events.map((event) => (
            <li id={`crn-timeline-${event.date}`} key={event.date} className="timeline-item">
              <time id={`crn-timeline-date-${event.date}`} dateTime={event.date}>
                {event.date}
              </time>
              <p id={`crn-timeline-summary-${event.date}`}>
                {locale === "zh" ? event.zh : event.en}
              </p>
            </li>
          ))}
        </ol>
      </section>

      <section id="crn-evidence-section" className="content-section evidence-section" aria-labelledby="crn-evidence-title">
        <div id="crn-evidence-heading-group" className="section-heading">
          <p id="crn-evidence-label" className="section-label">
            {t.archive}
          </p>
          <h2 id="crn-evidence-title">{t.evidence}</h2>
          <p id="crn-evidence-description" className="muted">
            {locale === "zh"
              ? "登录后，文件将以短时签名地址直接传至 Pinata；Vercel 不接收文件二进制。"
              : "After sign-in, files upload directly to Pinata through a short-lived signed URL; Vercel does not receive file bytes."}
          </p>
        </div>
        <EvidenceIntake locale={locale} caseCode={caseCode} />
      </section>

      <footer id="crn-site-footer" className="site-footer">
        <p id="crn-current-site-note">{t.currentSite}</p>
        <p id="crn-compliance-note">{t.footer}</p>
      </footer>
    </main>
  );
}
