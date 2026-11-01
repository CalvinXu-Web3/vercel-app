export type CaseSubmissionState =
  | "submitted"
  | "triage"
  | "needs_information"
  | "accepted"
  | "rejected"
  | "withdrawn";

export type CaseSubmissionReviewAction =
  | "start_triage"
  | "request_information"
  | "accept"
  | "reject";

export type CaseSubmissionOwnerAction = "resubmit" | "withdraw";

const transitions: Record<
  CaseSubmissionReviewAction,
  { from: ReadonlySet<CaseSubmissionState>; to: CaseSubmissionState }
> = {
  start_triage: {
    from: new Set(["submitted"]),
    to: "triage",
  },
  request_information: {
    from: new Set(["submitted", "triage"]),
    to: "needs_information",
  },
  accept: {
    from: new Set(["submitted", "triage"]),
    to: "accepted",
  },
  reject: {
    from: new Set(["submitted", "triage"]),
    to: "rejected",
  },
};

export function caseSubmissionReviewTransition(
  state: CaseSubmissionState,
  action: CaseSubmissionReviewAction,
) {
  const transition = transitions[action];
  return transition.from.has(state) ? transition.to : null;
}

const ownerTransitions: Record<
  CaseSubmissionOwnerAction,
  { from: ReadonlySet<CaseSubmissionState>; to: CaseSubmissionState }
> = {
  resubmit: {
    from: new Set(["needs_information"]),
    to: "submitted",
  },
  withdraw: {
    from: new Set(["submitted", "triage", "needs_information"]),
    to: "withdrawn",
  },
};

export function caseSubmissionOwnerTransition(
  state: CaseSubmissionState,
  action: CaseSubmissionOwnerAction,
) {
  const transition = ownerTransitions[action];
  return transition.from.has(state) ? transition.to : null;
}
