"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { EvidenceIntake } from "@/components/evidence-intake";

type CaseData = {
  case: {
    id: string; code: string; titleZh: string; titleEn: string; summaryZh: string | null;
    summaryEn: string | null; workflowNote: string | null; status: string; visibility: string; currentPublishedVersion: number | null; updatedAt: string;
  };
  capabilities: { edit: boolean; review: boolean; publish: boolean; manageMembers: boolean };
  timeline: Array<{ id: string; occurredAt: string; titleZh: string; titleEn: string; updatedAt: string }>;
  entities: Array<{ id: string; type: string; label: string; updatedAt: string }>;
  relations: Array<{ id: string; fromEntityId: string; toEntityId: string; relationType: string; updatedAt: string }>;
  wallets: Array<{ id: string; chain: string; address: string; label: string; explorerUrl: string; entityId: string | null; updatedAt: string }>;
  members: Array<{ id: string; userId: string; role: "owner" | "editor" | "reviewer" | "viewer"; updatedAt: string }>;
};

async function responseMessage(response: Response) {
  const payload = (await response.json().catch(() => null)) as { error?: string } | null;
  return payload?.error ?? `请求失败（${response.status}）。`;
}

export function CaseWorkspaceEditor({ caseId }: { caseId: string }) {
  const [data, setData] = useState<CaseData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [workflowNote, setWorkflowNote] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/cases/${caseId}`, { cache: "no-store" });
      if (!response.ok) throw new Error(await responseMessage(response));
      const payload = await response.json() as CaseData;
      setData(payload);
      setWorkflowNote(payload.case.workflowNote ?? "");
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "无法载入案件。");
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => { void load(); }, [load]);

  const saveCase = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!data) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      const response = await fetch(`/api/cases/${caseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedUpdatedAt: data.case.updatedAt,
          titleZh: form.get("titleZh"), titleEn: form.get("titleEn"),
          summaryZh: form.get("summaryZh") || undefined, summaryEn: form.get("summaryEn") || undefined,
        }),
      });
      if (!response.ok) throw new Error(await responseMessage(response));
      setMessage("案件基本信息已保存。");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存失败。");
    } finally { setBusy(false); }
  };

  const workflow = async (action: string) => {
    if (!data) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/cases/${caseId}/workflow`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          expectedUpdatedAt: data.case.updatedAt,
          note: action === "request_information" || action === "reject"
            ? workflowNote.trim() || undefined
            : undefined,
        }),
      });
      if (!response.ok) throw new Error(await responseMessage(response));
      setMessage("案件流程状态已更新。");
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "流程更新失败。"); }
    finally { setBusy(false); }
  };

  const publish = async () => {
    if (!data) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/cases/${caseId}/publish`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedUpdatedAt: data.case.updatedAt }),
      });
      if (!response.ok) throw new Error(await responseMessage(response));
      setMessage("已生成新的不可变公开版本。");
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "发布失败。"); }
    finally { setBusy(false); }
  };

  const createContent = async (kind: string, event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const values = Object.fromEntries([...form.entries()].map(([key, value]) => [key, value || undefined]));
    setBusy(true);
    try {
      const response = await fetch(`/api/cases/${caseId}/content`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operation: "create", kind, ...values, entityId: values.entityId || null }),
      });
      if (!response.ok) throw new Error(await responseMessage(response));
      formElement.reset();
      setMessage("结构化案件内容已添加。");
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "内容添加失败。"); }
    finally { setBusy(false); }
  };

  const upsertMember = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusy(true);
    try {
      const response = await fetch(`/api/cases/${caseId}/members`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: form.get("userId"), role: form.get("role") }),
      });
      if (!response.ok) throw new Error(await responseMessage(response));
      formElement.reset();
      setMessage("案件成员权限已更新。");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "成员权限更新失败。");
    } finally {
      setBusy(false);
    }
  };

  const removeContent = async (kind: string, id: string, expectedUpdatedAt: string) => {
    setBusy(true);
    try {
      const response = await fetch(`/api/cases/${caseId}/content`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operation: "delete", kind, id, expectedUpdatedAt }),
      });
      if (!response.ok) throw new Error(await responseMessage(response));
      setMessage("记录已删除。");
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "删除失败。请先解除关联记录。"); }
    finally { setBusy(false); }
  };

  if (loading) return <main className="review-page"><p className="review-empty">正在读取案件工作区…</p></main>;
  if (!data) return <main className="review-page"><p className="review-message">{message || "案件不可用。"}</p></main>;
  const editable = data.capabilities.edit && ["draft", "needs_information"].includes(data.case.status);

  return (
    <main className="review-page workspace-page">
      <header className="review-page-header"><div><span className="section-index">{data.case.code}</span><h1>{data.case.titleZh}</h1><p>状态：{data.case.status.replaceAll("_", " ")} · 可见性：{data.case.visibility}</p></div><div className="review-header-actions"><Link className="button button-ghost small" href="/workspace/cases">返回列表</Link><button className="button button-ghost small" type="button" onClick={() => void load()}>刷新</button></div></header>
      {message && <p className="review-message" role="status">{message}</p>}
      <section className="workspace-section">
        <h2>基本信息</h2>
        <form className="workspace-form" onSubmit={saveCase}>
          <label>中文标题<input name="titleZh" defaultValue={data.case.titleZh} disabled={!editable} required /></label>
          <label>英文标题<input name="titleEn" defaultValue={data.case.titleEn} disabled={!editable} required /></label>
          <label className="workspace-form-wide">中文摘要<textarea name="summaryZh" defaultValue={data.case.summaryZh ?? ""} disabled={!editable} rows={4} /></label>
          <label className="workspace-form-wide">英文摘要<textarea name="summaryEn" defaultValue={data.case.summaryEn ?? ""} disabled={!editable} rows={4} /></label>
          {editable && <div className="workspace-form-actions workspace-form-wide"><button className="button button-primary small" disabled={busy}>保存基本信息</button></div>}
        </form>
        {data.case.workflowNote && <div className="workspace-review-note"><strong>审核反馈</strong><p>{data.case.workflowNote}</p></div>}
        {data.capabilities.review && data.case.status === "under_review" && <label className="review-note-field">审核反馈（退回补充或拒绝时必填）<textarea rows={3} maxLength={4_000} value={workflowNote} onChange={(event) => setWorkflowNote(event.target.value)} /></label>}
        <div className="review-actions workspace-workflow-actions">
          {editable && <button className="button button-primary small" type="button" disabled={busy} onClick={() => void workflow("submit")}>提交审核</button>}
          {data.capabilities.review && data.case.status === "submitted" && <button className="button button-primary small" type="button" disabled={busy} onClick={() => void workflow("start_review")}>开始审核</button>}
          {data.capabilities.review && data.case.status === "under_review" && <><button className="button button-ghost small" type="button" disabled={busy || !workflowNote.trim()} onClick={() => void workflow("request_information")}>退回补充</button><button className="button button-primary small" type="button" disabled={busy} onClick={() => void workflow("approve")}>审核通过</button><button className="review-danger" type="button" disabled={busy || !workflowNote.trim()} onClick={() => void workflow("reject")}>拒绝</button></>}
          {data.capabilities.publish && data.case.status === "approved" && <button className="button button-primary small" type="button" disabled={busy} onClick={() => void publish()}>发布不可变版本</button>}
          {data.capabilities.publish && data.case.status === "published" && <button className="button button-ghost small" type="button" disabled={busy} onClick={() => void workflow("start_revision")}>新建修订草稿</button>}
          {data.case.currentPublishedVersion && <Link className="button button-ghost small" href={`/cases/${encodeURIComponent(data.case.code)}`}>查看公开版本 V{data.case.currentPublishedVersion}</Link>}
          {data.capabilities.review && <Link className="button button-ghost small" href={`/review/evidence?caseId=${caseId}`}>审核本案材料</Link>}
          {data.capabilities.review && <Link className="button button-ghost small" href={`/review/signatures?caseId=${caseId}`}>审核本案联署</Link>}
        </div>
      </section>

      {data.capabilities.manageMembers && <section className="workspace-section"><h2>案件成员与职责</h2><p className="review-description">使用 Clerk User ID 添加协作者。案件负责人可编辑及管理成员；审核员只能审核；发布权仍由组织发布员或平台管理员持有。</p><form className="workspace-inline-form" onSubmit={upsertMember}><input name="userId" placeholder="Clerk User ID（user_…）" required maxLength={255} /><select name="role" defaultValue="viewer"><option value="owner">案件负责人</option><option value="editor">编辑</option><option value="reviewer">审核员</option><option value="viewer">只读成员</option></select><button className="button button-primary small" disabled={busy}>添加 / 更新成员</button></form><div className="workspace-record-list">{data.members.map((member) => <article key={member.id}><div><strong>{member.userId}</strong><span>{member.role} · {new Date(member.updatedAt).toLocaleString("zh-CN")}</span></div></article>)}</div></section>}

      <section className="workspace-section"><h2>时间线</h2>{editable && <form className="workspace-inline-form" onSubmit={(event) => void createContent("timeline", event)}><input name="occurredAt" type="datetime-local" required /><input name="titleZh" placeholder="中文标题" required /><input name="titleEn" placeholder="英文标题" required /><button className="button button-primary small" disabled={busy}>添加</button></form>}<div className="workspace-record-list">{data.timeline.map((item) => <article key={item.id}><div><strong>{item.titleZh}</strong><span>{new Date(item.occurredAt).toLocaleString("zh-CN")}</span></div>{editable && <button className="review-danger" type="button" disabled={busy} onClick={() => void removeContent("timeline", item.id, item.updatedAt)}>删除</button>}</article>)}</div></section>

      <section className="workspace-section"><h2>人物 / 实体</h2>{editable && <form className="workspace-inline-form" onSubmit={(event) => void createContent("entity", event)}><select name="type" defaultValue="person"><option value="person">人员</option><option value="organization">组织</option><option value="wallet">钱包实体</option><option value="location">地点</option><option value="document">文档</option><option value="other">其他</option></select><input name="label" placeholder="公开前的内部标签" required /><input name="description" placeholder="说明（可选）" /><button className="button button-primary small" disabled={busy}>添加</button></form>}<div className="workspace-record-list">{data.entities.map((item) => <article key={item.id}><div><strong>{item.label}</strong><span>{item.type}</span></div>{editable && <button className="review-danger" type="button" disabled={busy} onClick={() => void removeContent("entity", item.id, item.updatedAt)}>删除</button>}</article>)}</div></section>

      <section className="workspace-section"><h2>实体关系</h2>{editable && data.entities.length >= 2 && <form className="workspace-inline-form" onSubmit={(event) => void createContent("relation", event)}><select name="fromEntityId" required>{data.entities.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}</select><select name="toEntityId" required>{data.entities.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}</select><input name="relationType" placeholder="关系类型" required /><button className="button button-primary small" disabled={busy}>添加</button></form>}<div className="workspace-record-list">{data.relations.map((item) => <article key={item.id}><div><strong>{item.relationType}</strong><span>{item.fromEntityId} → {item.toEntityId}</span></div>{editable && <button className="review-danger" type="button" disabled={busy} onClick={() => void removeContent("relation", item.id, item.updatedAt)}>删除</button>}</article>)}</div></section>

      <section className="workspace-section"><h2>钱包与链上地址</h2>{editable && <form className="workspace-inline-form" onSubmit={(event) => void createContent("wallet", event)}><input name="chain" placeholder="链，例如 ETH" required /><input name="address" placeholder="钱包地址" required /><input name="label" placeholder="案件内标签" required /><input name="explorerUrl" type="url" placeholder="浏览器链接" required /><select name="entityId" defaultValue=""><option value="">不关联实体</option>{data.entities.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}</select><button className="button button-primary small" disabled={busy}>添加</button></form>}<div className="workspace-record-list">{data.wallets.map((item) => <article key={item.id}><div><strong>{item.label} · {item.chain}</strong><span>{item.address}</span></div>{editable && <button className="review-danger" type="button" disabled={busy} onClick={() => void removeContent("wallet", item.id, item.updatedAt)}>删除</button>}</article>)}</div></section>
      <section className="workspace-section"><h2>私有材料补交</h2><p className="review-description">案件成员可在公开前继续补交原始材料；文件仍然只进入受控审核队列。</p><EvidenceIntake locale="zh" caseId={caseId} /></section>
    </main>
  );
}
