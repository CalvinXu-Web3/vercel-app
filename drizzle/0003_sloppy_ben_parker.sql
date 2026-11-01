CREATE TYPE "public"."case_role" AS ENUM('owner', 'editor', 'reviewer', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."case_submission_status" AS ENUM('submitted', 'triage', 'needs_information', 'accepted', 'rejected', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."case_visibility" AS ENUM('private', 'organization', 'unlisted', 'public');--> statement-breakpoint
CREATE TYPE "public"."case_workflow_status" AS ENUM('draft', 'submitted', 'triage', 'needs_information', 'under_review', 'approved', 'published', 'rejected', 'archived');--> statement-breakpoint
CREATE TYPE "public"."organization_role" AS ENUM('owner', 'editor', 'reviewer', 'publisher');--> statement-breakpoint
CREATE TABLE "case_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"role" "case_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "case_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submitter_id" varchar(255) NOT NULL,
	"title_zh" varchar(240) NOT NULL,
	"title_en" varchar(240),
	"summary_zh" text NOT NULL,
	"summary_en" text,
	"jurisdiction" varchar(120),
	"incident_started_at" timestamp with time zone,
	"status" "case_submission_status" DEFAULT 'submitted' NOT NULL,
	"review_note" text,
	"reviewer_id" varchar(255),
	"accepted_case_id" uuid,
	"consented_at" timestamp with time zone NOT NULL,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"role" "organization_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(80) NOT NULL,
	"name" varchar(160) NOT NULL,
	"created_by" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
INSERT INTO "organizations" ("id", "slug", "name", "created_by")
VALUES (
	'00000000-0000-4000-8000-000000000001',
	'crn-review',
	'CRN Review Workspace',
	'system'
);--> statement-breakpoint
UPDATE "cases" SET "status" = 'draft' WHERE "status" = 'pending_review';--> statement-breakpoint
ALTER TABLE "cases" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "cases" ALTER COLUMN "status" SET DATA TYPE "public"."case_workflow_status" USING "status"::text::"public"."case_workflow_status";--> statement-breakpoint
ALTER TABLE "cases" ALTER COLUMN "status" SET DEFAULT 'draft';--> statement-breakpoint
ALTER TABLE "audit_logs" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD COLUMN "resource_type" varchar(80);--> statement-breakpoint
ALTER TABLE "audit_logs" ADD COLUMN "resource_id" uuid;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD COLUMN "request_id" varchar(120);--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "created_by" varchar(255);--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "visibility" "case_visibility" DEFAULT 'private' NOT NULL;--> statement-breakpoint
UPDATE "cases"
SET
	"organization_id" = '00000000-0000-4000-8000-000000000001',
	"created_by" = 'system',
	"visibility" = CASE WHEN "is_public" THEN 'public'::"case_visibility" ELSE 'private'::"case_visibility" END;--> statement-breakpoint
ALTER TABLE "cases" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "cases" ALTER COLUMN "created_by" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "case_members" ADD CONSTRAINT "case_members_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_submissions" ADD CONSTRAINT "case_submissions_accepted_case_id_cases_id_fk" FOREIGN KEY ("accepted_case_id") REFERENCES "public"."cases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "case_members_case_user_key" ON "case_members" USING btree ("case_id","user_id");--> statement-breakpoint
CREATE INDEX "case_members_user_idx" ON "case_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "case_submissions_submitter_created_idx" ON "case_submissions" USING btree ("submitter_id","created_at");--> statement-breakpoint
CREATE INDEX "case_submissions_status_created_idx" ON "case_submissions" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_members_org_user_key" ON "organization_members" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE INDEX "organization_members_user_idx" ON "organization_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations" USING btree ("slug");--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_logs_resource_created_idx" ON "audit_logs" USING btree ("resource_type","resource_id","created_at");--> statement-breakpoint
CREATE INDEX "cases_organization_status_idx" ON "cases" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "cases_created_by_idx" ON "cases" USING btree ("created_by");
