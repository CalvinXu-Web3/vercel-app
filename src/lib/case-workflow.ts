export type CaseWorkflowState =
  | "draft"
  | "submitted"
  | "triage"
  | "needs_information"
  | "under_review"
  | "approved"
  | "published"
  | "rejected"
  | "archived";

export type CaseWorkflowAction =
  | "submit"
  | "start_review"
  | "request_information"
  | "approve"
  | "reject"
  | "start_revision"
  | "archive";

const transitions: Record<
  CaseWorkflowAction,
  { from: ReadonlySet<CaseWorkflowState>; to: CaseWorkflowState }
> = {
  submit: { from: new Set(["draft", "needs_information"]), to: "submitted" },
  start_review: { from: new Set(["submitted", "triage"]), to: "under_review" },
  request_information: {
    from: new Set(["submitted", "triage", "under_review"]),
    to: "needs_information",
  },
  approve: { from: new Set(["under_review"]), to: "approved" },
  reject: { from: new Set(["submitted", "triage", "under_review"]), to: "rejected" },
  start_revision: { from: new Set(["published"]), to: "draft" },
  archive: {
    from: new Set(["draft", "rejected", "published"]),
    to: "archived",
  },
};

export function caseWorkflowTransition(state: CaseWorkflowState, action: CaseWorkflowAction) {
  const transition = transitions[action];
  return transition.from.has(state) ? transition.to : null;
}

export function isCaseContentEditable(state: CaseWorkflowState) {
  return state === "draft" || state === "needs_information";
}
