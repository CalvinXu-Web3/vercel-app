"use client";

import { FormEvent, useEffect, useState } from "react";
import { Show, SignInButton } from "@clerk/nextjs";

type Locale = "zh" | "en";
type SignatureVisibility = "anonymous_public" | "alias_public" | "count_only";
type SignatureStatus = "pending_review" | "approved" | "rejected" | "revoked";

type PublicSignature = {
  id: string;
  alias: string | null;
  visibility: Exclude<SignatureVisibility, "count_only">;
  approvedAt: string | null;
};

type OwnSignature = {
  id: string;
  alias: string | null;
  visibility: SignatureVisibility;
  status: SignatureStatus;
  createdAt: string;
  reviewedAt: string | null;
};

const labels = {
  zh: {
    eyebrow: "06 / AFFECTED PERSONS",
    countLabel: "已审核联署",
    title: "受影响者联署墙",
    description: "以匿名或化名表达支持。联署不是证据，也不构成对案件事实或身份的司法认定。",
    empty: "首批经审核公开的联署将在这里显示。",
    signIn: "登录后加入联署",
    signInNote: "需登录以防止重复提交；公开墙不会显示账户身份。",
    formTitle: "加入或更新联署",
    anonymous: "匿名公开",
    anonymousNote: "公开墙仅显示“匿名受影响者”和审核月份。",
    alias: "化名公开",
    aliasNote: "公开墙显示化名和审核月份。",
    countOnly: "仅计数，不公开展示",
    countOnlyNote: "审核通过后仅计入总数，不显示在公开墙。",
    aliasLabel: "公开化名",
    consent: "我确认这是个人联署声明；不在此提交材料，并理解公开展示需经过审核。",
    submit: "提交联署审核",
    updating: "正在提交…",
    pending: "你的联署正在等待审核，暂不会公开显示。",
    approved: "你的联署已通过审核。",
    rejected: "该联署未获公开；你可以更新展示方式后重新提交审核。",
    revoked: "你已撤回联署；如需恢复，可重新提交审核。",
    withdraw: "撤回联署",
    withdrawing: "正在撤回…",
    withdrawSuccess: "联署已撤回，不再公开显示或计入统计。",
    submitSuccess: "联署已提交，等待审核后才会公开或计入统计。",
    publicAlias: "受影响者",
    publicAnonymous: "匿名受影响者",
    reviewedMonth: "审核公开",
    evidencePrompt: "有材料需要提交？请使用下方安全提交入口。",
  },
  en: {
    eyebrow: "06 / AFFECTED PERSONS",
    countLabel: "REVIEWED SIGNATURES",
    title: "AFFECTED-PERSON SIGNATURE WALL",
    description: "Join anonymously or with an alias. A signature is not evidence and is not a legal finding about the case or anyone’s identity.",
    empty: "The first reviewed public signatures will appear here.",
    signIn: "SIGN IN TO JOIN",
    signInNote: "Sign-in prevents duplicate submissions. Your account identity is never shown on the public wall.",
    formTitle: "JOIN OR UPDATE YOUR SIGNATURE",
    anonymous: "PUBLICLY ANONYMOUS",
    anonymousNote: "The wall shows only “Anonymous affected person” and the approval month.",
    alias: "PUBLIC ALIAS",
    aliasNote: "The wall shows your alias and the approval month.",
    countOnly: "COUNT ONLY",
    countOnlyNote: "After review, this counts toward the total but is not shown on the wall.",
    aliasLabel: "PUBLIC ALIAS",
    consent: "I confirm this is a personal signature statement, not an evidence submission, and I understand public display requires review.",
    submit: "SUBMIT FOR REVIEW",
    updating: "SUBMITTING…",
    pending: "Your signature is awaiting review and is not public yet.",
    approved: "Your signature has been approved.",
    rejected: "This signature was not approved for publication. Update the display option to submit it for review again.",
    revoked: "You withdrew this signature. You can submit again whenever you choose.",
    withdraw: "WITHDRAW SIGNATURE",
    withdrawing: "WITHDRAWING…",
    withdrawSuccess: "Your signature was withdrawn and no longer appears publicly or in the count.",
    submitSuccess: "Your signature was submitted. It is only public or counted after review.",
    publicAlias: "Affected person",
    publicAnonymous: "Anonymous affected person",
    reviewedMonth: "REVIEWED",
    evidencePrompt: "Have material to submit? Use the secure intake below.",
  },
} as const;

function formatMonth(value: string | null, locale: Locale) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en", {
    year: "numeric",
    month: "2-digit",
  }).format(new Date(value));
}

async function responseMessage(response: Response) {
  const payload = (await response.json().catch(() => null)) as { error?: string } | null;
  return payload?.error ?? `Request failed (${response.status}).`;
}

function SignedInSignatureControls({
  caseCode,
  locale,
  onChanged,
}: {
  caseCode: string;
  locale: Locale;
  onChanged: () => void;
}) {
  const t = labels[locale];
  const [signature, setSignature] = useState<OwnSignature | null>(null);
  const [visibility, setVisibility] = useState<SignatureVisibility>("anonymous_public");
  const [alias, setAlias] = useState("");
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/signatures?caseCode=${encodeURIComponent(caseCode)}`, { cache: "no-store" });
      if (!response.ok) throw new Error(await responseMessage(response));
      const payload = (await response.json()) as { signature: OwnSignature | null };
      setSignature(payload.signature);
      if (payload.signature) {
        setVisibility(payload.signature.visibility);
        setAlias(payload.signature.alias ?? "");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load your signature.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [caseCode]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!consent) return;
    setSubmitting(true);
    try {
      const response = await fetch("/api/signatures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caseCode,
          visibility,
          alias: visibility === "alias_public" ? alias.trim() : undefined,
          consent: true,
        }),
      });
      if (!response.ok) throw new Error(await responseMessage(response));
      const payload = (await response.json()) as { signature: OwnSignature };
      setSignature(payload.signature);
      setConsent(false);
      setMessage(t.submitSuccess);
      onChanged();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to submit your signature.");
    } finally {
      setSubmitting(false);
    }
  };

  const withdraw = async () => {
    setSubmitting(true);
    try {
      const response = await fetch("/api/signatures", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseCode }),
      });
      if (!response.ok) throw new Error(await responseMessage(response));
      setSignature((current) => current ? { ...current, status: "revoked" } : current);
      setMessage(t.withdrawSuccess);
      onChanged();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to withdraw your signature.");
    } finally {
      setSubmitting(false);
    }
  };

  const active = signature?.status === "pending_review" || signature?.status === "approved";
  const stateMessage = signature?.status === "pending_review"
    ? t.pending
    : signature?.status === "approved"
      ? t.approved
      : signature?.status === "rejected"
        ? t.rejected
        : signature?.status === "revoked"
          ? t.revoked
          : "";

  return (
    <div className="signature-control-panel">
      <div className="signature-control-heading">
        <h3>{t.formTitle}</h3>
        {stateMessage && <p className="signature-state" role="status">{stateMessage}</p>}
      </div>
      {loading ? <p className="signature-state">…</p> : <>
        <form className="signature-form" onSubmit={submit}>
          <fieldset>
            <legend>{t.formTitle}</legend>
            {(["anonymous_public", "alias_public", "count_only"] as const).map((option) => {
              const title = option === "anonymous_public" ? t.anonymous : option === "alias_public" ? t.alias : t.countOnly;
              const note = option === "anonymous_public" ? t.anonymousNote : option === "alias_public" ? t.aliasNote : t.countOnlyNote;
              return <label className="signature-visibility-option" key={option}>
                <input type="radio" name="signature-visibility" value={option} checked={visibility === option} onChange={() => setVisibility(option)} />
                <span><strong>{title}</strong><small>{note}</small></span>
              </label>;
            })}
          </fieldset>
          {visibility === "alias_public" && <label className="signature-alias-label">{t.aliasLabel}<input value={alias} maxLength={48} minLength={2} required onChange={(event) => setAlias(event.target.value)} /></label>}
          <label className="signature-consent"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} required /><span>{t.consent}</span></label>
          <div className="signature-form-actions">
            <button className="button button-primary small" type="submit" disabled={submitting || !consent}>{submitting ? t.updating : t.submit}</button>
            {active && <button className="review-danger" type="button" disabled={submitting} onClick={() => void withdraw()}>{submitting ? t.withdrawing : t.withdraw}</button>}
          </div>
        </form>
        {message && <p className="signature-state" role="status">{message}</p>}
      </>}
    </div>
  );
}

export function VictimSignatureWall({
  caseCode,
  locale,
  approvedCount,
  signatures,
  onChanged,
}: {
  caseCode: string;
  locale: Locale;
  approvedCount: number;
  signatures: PublicSignature[];
  onChanged: () => void;
}) {
  const t = labels[locale];
  return (
    <section id="crn-victim-signatures" className="victim-signature-wall" aria-labelledby="crn-victim-signatures-title">
      <div className="signature-wall-heading">
        <div><span className="section-index">{t.eyebrow}</span><h3 id="crn-victim-signatures-title">{t.title}</h3><p>{t.description}</p></div>
        <div className="signature-count"><strong>{approvedCount}</strong><span>{t.countLabel}</span></div>
      </div>
      <div className="signature-public-list" aria-label={t.countLabel}>
        {signatures.length ? signatures.map((signature) => <article className="signature-public-card" key={signature.id}><span>{signature.visibility === "alias_public" ? signature.alias || t.publicAlias : t.publicAnonymous}</span><small>{t.reviewedMonth} · {formatMonth(signature.approvedAt, locale)}</small></article>) : <p>{t.empty}</p>}
      </div>
      <Show when="signed-out">
        <div className="signature-sign-in-panel"><p>{t.signInNote}</p><SignInButton mode="modal"><button id="crn-signature-sign-in" className="button button-primary small" type="button">{t.signIn}</button></SignInButton></div>
      </Show>
      <Show when="signed-in"><SignedInSignatureControls caseCode={caseCode} locale={locale} onChanged={onChanged} /></Show>
      <p className="signature-evidence-prompt">{t.evidencePrompt}</p>
    </section>
  );
}
