import { auth } from "@clerk/nextjs/server";
import { HttpError } from "@/lib/http";

export type Role = "contributor" | "reviewer" | "admin";

export type Actor = {
  id: string;
  role: Role;
};

function configuredIds(name: string) {
  return new Set(
    (process.env[name] ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

export async function requireContributor(): Promise<Actor> {
  if (
    !process.env.CLERK_SECRET_KEY ||
    !process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
  ) {
    throw new HttpError(503, "Authentication is not configured.");
  }

  const session = await auth();
  if (!session.isAuthenticated || !session.userId) {
    throw new HttpError(401, "Sign in is required.");
  }

  const adminIds = configuredIds("CRN_ADMIN_USER_IDS");
  const reviewerIds = configuredIds("CRN_REVIEWER_USER_IDS");
  const role: Role = adminIds.has(session.userId)
    ? "admin"
    : reviewerIds.has(session.userId)
      ? "reviewer"
      : "contributor";

  return { id: session.userId, role };
}

export async function requireReviewer(): Promise<Actor> {
  const actor = await requireContributor();
  if (actor.role !== "admin" && actor.role !== "reviewer") {
    throw new HttpError(403, "Reviewer access is required.");
  }
  return actor;
}
