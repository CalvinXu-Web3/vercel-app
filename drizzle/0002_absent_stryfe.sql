CREATE TYPE "public"."signature_status" AS ENUM('pending_review', 'approved', 'rejected', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."signature_visibility" AS ENUM('anonymous_public', 'alias_public', 'count_only');--> statement-breakpoint
CREATE TABLE "victim_signatures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"signer_id" varchar(255) NOT NULL,
	"alias" varchar(48),
	"visibility" "signature_visibility" DEFAULT 'anonymous_public' NOT NULL,
	"status" "signature_status" DEFAULT 'pending_review' NOT NULL,
	"consented_at" timestamp with time zone NOT NULL,
	"reviewer_id" varchar(255),
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "victim_signatures" ADD CONSTRAINT "victim_signatures_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "victim_signatures_case_signer_key" ON "victim_signatures" USING btree ("case_id","signer_id");--> statement-breakpoint
CREATE INDEX "victim_signatures_case_status_idx" ON "victim_signatures" USING btree ("case_id","status");