export type GlobalRole = "contributor" | "reviewer" | "admin";
export type OrganizationRole = "owner" | "editor" | "reviewer" | "publisher";
export type CaseRole = "owner" | "editor" | "reviewer" | "viewer";
export type CasePermission =
  | "case:view"
  | "case:edit"
  | "case:review"
  | "case:publish"
  | "case:members:manage";

export function canAccessWorkspace(role: GlobalRole) {
  return role === "reviewer" || role === "admin";
}

const organizationPermissions: Record<OrganizationRole, ReadonlySet<CasePermission>> = {
  owner: new Set([
    "case:view",
    "case:edit",
    "case:review",
    "case:publish",
    "case:members:manage",
  ]),
  editor: new Set(["case:view", "case:edit"]),
  reviewer: new Set(["case:view", "case:review"]),
  publisher: new Set(["case:view", "case:review", "case:publish"]),
};

const casePermissions: Record<CaseRole, ReadonlySet<CasePermission>> = {
  owner: new Set(["case:view", "case:edit", "case:members:manage"]),
  editor: new Set(["case:view", "case:edit"]),
  reviewer: new Set(["case:view", "case:review"]),
  viewer: new Set(["case:view"]),
};

export function hasCasePermission(
  input: {
    globalRole: GlobalRole;
    organizationRole?: OrganizationRole | null;
    caseRole?: CaseRole | null;
    isCreator?: boolean;
  },
  permission: CasePermission,
) {
  if (input.globalRole === "admin") return true;
  if (
    input.globalRole === "reviewer" &&
    (permission === "case:view" || permission === "case:review")
  ) {
    return true;
  }
  if (input.organizationRole && organizationPermissions[input.organizationRole].has(permission)) {
    return true;
  }
  if (input.caseRole && casePermissions[input.caseRole].has(permission)) return true;
  return Boolean(
    input.isCreator && (permission === "case:view" || permission === "case:edit"),
  );
}
