CREATE TYPE "public"."outbox_status" AS ENUM('pending', 'processing', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "outbox_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" varchar(120) NOT NULL,
	"aggregate_type" varchar(80) NOT NULL,
	"aggregate_id" uuid NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "outbox_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limit_buckets" (
	"key" varchar(128) PRIMARY KEY NOT NULL,
	"action" varchar(80) NOT NULL,
	"subject_hash" varchar(64) NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	"window_started_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "case_submissions" ADD COLUMN "idempotency_key" varchar(80);--> statement-breakpoint
ALTER TABLE "evidence_items" ADD COLUMN "idempotency_key" varchar(80);--> statement-breakpoint
CREATE INDEX "outbox_events_status_available_idx" ON "outbox_events" USING btree ("status","available_at");--> statement-breakpoint
CREATE INDEX "rate_limit_buckets_expires_idx" ON "rate_limit_buckets" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "case_submissions_submitter_idempotency_key" ON "case_submissions" USING btree ("submitter_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "evidence_items_submitter_idempotency_key" ON "evidence_items" USING btree ("submitter_id","idempotency_key");