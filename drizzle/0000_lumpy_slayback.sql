CREATE TYPE "public"."entity_type" AS ENUM('person', 'organization', 'wallet', 'location', 'document', 'other');--> statement-breakpoint
CREATE TYPE "public"."evidence_status" AS ENUM('pending_upload', 'upload_url_failed', 'uploaded', 'pending_review', 'approved', 'rejected', 'quarantined');--> statement-breakpoint
CREATE TYPE "public"."evidence_storage_mode" AS ENUM('private-ipfs', 'encrypted-public-ipfs');--> statement-breakpoint
CREATE TYPE "public"."evidence_visibility" AS ENUM('restricted', 'redacted_public');--> statement-breakpoint
CREATE TYPE "public"."review_status" AS ENUM('draft', 'pending_review', 'published', 'rejected', 'archived');--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid,
	"evidence_id" uuid,
	"actor_id" varchar(255) NOT NULL,
	"action" varchar(160) NOT NULL,
	"detail" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(64) NOT NULL,
	"title_zh" varchar(240) NOT NULL,
	"title_en" varchar(240) NOT NULL,
	"summary_zh" text,
	"summary_en" text,
	"is_public" boolean DEFAULT false NOT NULL,
	"status" "review_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"type" "entity_type" NOT NULL,
	"label" varchar(240) NOT NULL,
	"details" jsonb,
	"is_public" boolean DEFAULT false NOT NULL,
	"status" "review_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entity_relations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"from_entity_id" uuid NOT NULL,
	"to_entity_id" uuid NOT NULL,
	"relation_type" varchar(80) NOT NULL,
	"details" jsonb,
	"is_public" boolean DEFAULT false NOT NULL,
	"status" "review_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evidence_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"evidence_id" uuid NOT NULL,
	"original_filename" varchar(255) NOT NULL,
	"storage_filename" varchar(255) NOT NULL,
	"mime_type" varchar(128) NOT NULL,
	"original_bytes" integer NOT NULL,
	"upload_bytes" integer NOT NULL,
	"sha256" varchar(64) NOT NULL,
	"pinata_network" varchar(16) NOT NULL,
	"storage_mode" "evidence_storage_mode" NOT NULL,
	"pinata_file_id" varchar(255),
	"cid" varchar(255),
	"encryption_algorithm" varchar(64),
	"encryption_iv_base64" text,
	"encrypted_dek_base64" text,
	"status" "evidence_status" DEFAULT 'pending_upload' NOT NULL,
	"uploaded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evidence_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"submitter_id" varchar(255) NOT NULL,
	"title" varchar(240) NOT NULL,
	"description" text,
	"visibility" "evidence_visibility" DEFAULT 'restricted' NOT NULL,
	"status" "evidence_status" DEFAULT 'pending_upload' NOT NULL,
	"reviewer_id" varchar(255),
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "timeline_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"title_zh" varchar(240) NOT NULL,
	"title_en" varchar(240) NOT NULL,
	"summary_zh" text,
	"summary_en" text,
	"is_public" boolean DEFAULT false NOT NULL,
	"status" "review_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"entity_id" uuid,
	"chain" varchar(40) NOT NULL,
	"address" varchar(255) NOT NULL,
	"label" varchar(120) NOT NULL,
	"explorer_url" text NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"status" "review_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_evidence_id_evidence_items_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."evidence_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entities" ADD CONSTRAINT "entities_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_relations" ADD CONSTRAINT "entity_relations_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_relations" ADD CONSTRAINT "entity_relations_from_entity_id_entities_id_fk" FOREIGN KEY ("from_entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_relations" ADD CONSTRAINT "entity_relations_to_entity_id_entities_id_fk" FOREIGN KEY ("to_entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_files" ADD CONSTRAINT "evidence_files_evidence_id_evidence_items_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."evidence_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_items" ADD CONSTRAINT "evidence_items_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timeline_events" ADD CONSTRAINT "timeline_events_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_logs_case_created_idx" ON "audit_logs" USING btree ("case_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_evidence_created_idx" ON "audit_logs" USING btree ("evidence_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "cases_code_key" ON "cases" USING btree ("code");--> statement-breakpoint
CREATE INDEX "entities_case_type_idx" ON "entities" USING btree ("case_id","type");--> statement-breakpoint
CREATE INDEX "entity_relations_case_idx" ON "entity_relations" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "entity_relations_from_idx" ON "entity_relations" USING btree ("from_entity_id");--> statement-breakpoint
CREATE INDEX "entity_relations_to_idx" ON "entity_relations" USING btree ("to_entity_id");--> statement-breakpoint
CREATE INDEX "evidence_files_evidence_idx" ON "evidence_files" USING btree ("evidence_id");--> statement-breakpoint
CREATE UNIQUE INDEX "evidence_files_cid_key" ON "evidence_files" USING btree ("cid");--> statement-breakpoint
CREATE INDEX "evidence_items_case_status_idx" ON "evidence_items" USING btree ("case_id","status");--> statement-breakpoint
CREATE INDEX "evidence_items_submitter_idx" ON "evidence_items" USING btree ("submitter_id");--> statement-breakpoint
CREATE INDEX "timeline_events_case_occurred_idx" ON "timeline_events" USING btree ("case_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "wallets_chain_address_key" ON "wallets" USING btree ("chain","address");--> statement-breakpoint
CREATE INDEX "wallets_case_idx" ON "wallets" USING btree ("case_id");