import Link from "next/link";
import { redirect } from "next/navigation";
import { requireReviewer } from "@/lib/authorization";
import { HttpError } from "@/lib/http";
import { getWorkspaceOverview } from "@/lib/workspace-overview";

export const dynamic = "force-dynamic";

const roleLabels = {
  contributor: "案件协作者",
  reviewer: "平台审核员",
  admin: "平台管理员",
} as const;

type WorkspaceCard = {
  eyebrow: string;
  title: string;
  description: string;
  href: string;
  count?: number;
  countLabel?: string;
  primary?: boolean;
};

export default async function WorkspacePage() {
  let actor;
  try {
    actor = await requireReviewer();
  } catch (error) {
    if (error instanceof HttpError && (error.status === 401 || error.status === 403)) redirect("/");
    throw error;
  }

  const overview = await getWorkspaceOverview(actor);
  const cards: WorkspaceCard[] = [
    {
      eyebrow: "CASE WORKSPACE",
      title: "案件与内容",
      description: `管理正式案件、时间线、人物关系和链上地址。当前账号还有 ${overview.activeSubmissions} 条进行中的人工建档记录。`,
      href: "/workspace/cases",
      count: overview.accessibleCases,
      countLabel: "可访问案件",
      primary: true,
    },
    {
      eyebrow: "NEW INTAKE",
      title: "人工录入案件",
      description: "根据服务邮箱收到并完成人工初审的资料创建私有记录，再进入正式审核流程。",
      href: "/workspace/cases/new",
    },
  ];

  if (overview.canReviewCases) {
    cards.push({
      eyebrow: "CASE REVIEW",
      title: "正式案件审核",
      description: "进入有权限的案件，处理提交审核、补充信息和审核通过流程。",
      href: "/workspace/cases",
      count: overview.formalCasesAwaitingReview,
      countLabel: "待处理案件",
    });
  }

  if (overview.role === "reviewer" || overview.role === "admin") {
    cards.push(
      {
        eyebrow: "INTAKE REVIEW",
        title: "案件线索审核",
        description: "对新提交的私有案件线索进行初审、退回补充或接受为正式案件。",
        href: "/review/cases",
        count: overview.caseSubmissionsAwaitingReview,
        countLabel: "待处理线索",
      },
      {
        eyebrow: "EVIDENCE REVIEW",
        title: "材料审核",
        description: "审核受控材料，只发布脱敏后的标题和公开摘要。",
        href: "/review/evidence",
        count: overview.evidenceAwaitingReview,
        countLabel: "待审核材料",
      },
      {
        eyebrow: "SIGNATURE REVIEW",
        title: "联署审核",
        description: "审核匿名、化名或仅计数的受影响者联署申请。",
        href: "/review/signatures",
        count: overview.signaturesAwaitingReview,
        countLabel: "待审核联署",
      },
    );
  }

  if (overview.canPublishCases) {
    cards.push({
      eyebrow: "PUBLICATION",
      title: "发布管理",
      description: "从案件列表进入已审核通过的案件，生成带内容哈希的不可变公开版本。",
      href: "/workspace/cases",
      count: overview.casesAwaitingPublication,
      countLabel: "待发布案件",
    });
  }

  return (
    <main className="review-page workspace-page workspace-dashboard">
      <header className="review-page-header">
        <div>
          <span className="section-index">CONTROLLED WORKSPACE</span>
          <h1>案件管理工作台</h1>
          <p>统一进入案件录入、内容管理、审核和发布流程。当前身份：{roleLabels[overview.role]}。</p>
        </div>
        <div className="review-header-actions">
          <Link className="button button-ghost small" href="/">返回公开页面</Link>
        </div>
      </header>

      <section className="workspace-dashboard-grid" aria-label="工作台功能">
        {cards.map((card) => (
          <Link className={card.primary ? "workspace-dashboard-card is-primary" : "workspace-dashboard-card"} href={card.href} key={`${card.eyebrow}-${card.title}`}>
            <article>
              <span>{card.eyebrow}</span>
              <div className="workspace-dashboard-card-heading">
                <h2>{card.title}</h2>
                {card.count !== undefined && <strong>{card.count}</strong>}
              </div>
              <p>{card.description}</p>
              <footer>
                <small>{card.countLabel ?? "打开功能"}</small>
                <i aria-hidden="true">↗</i>
              </footer>
            </article>
          </Link>
        ))}
      </section>

      <p className="workspace-security-note">菜单仅用于导航；每个页面和数据接口仍会独立执行身份与案件权限校验。</p>
    </main>
  );
}
