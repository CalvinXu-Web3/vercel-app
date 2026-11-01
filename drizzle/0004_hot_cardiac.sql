CREATE TABLE "case_wallets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"wallet_id" uuid NOT NULL,
	"entity_id" uuid,
	"label" varchar(120) NOT NULL,
	"explorer_url" text NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"status" "review_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallet_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chain" varchar(40) NOT NULL,
	"address" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
INSERT INTO "wallet_assets" ("id", "chain", "address", "created_at")
SELECT "id", "chain", "address", "created_at" FROM "wallets";--> statement-breakpoint
INSERT INTO "case_wallets" (
	"id", "case_id", "wallet_id", "entity_id", "label", "explorer_url",
	"is_public", "status", "created_at", "updated_at"
)
SELECT
	"id", "case_id", "id", "entity_id", "label", "explorer_url",
	"is_public", "status", "created_at", now()
FROM "wallets";--> statement-breakpoint
ALTER TABLE "wallets" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "wallets" CASCADE;--> statement-breakpoint
ALTER TABLE "entity_relations" DROP CONSTRAINT "entity_relations_from_entity_id_entities_id_fk";
--> statement-breakpoint
ALTER TABLE "entity_relations" DROP CONSTRAINT "entity_relations_to_entity_id_entities_id_fk";
--> statement-breakpoint
ALTER TABLE "entities" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "entity_relations" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "timeline_events" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "entities_case_id_id_key" ON "entities" USING btree ("case_id","id");--> statement-breakpoint
ALTER TABLE "case_wallets" ADD CONSTRAINT "case_wallets_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_wallets" ADD CONSTRAINT "case_wallets_wallet_id_wallet_assets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallet_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_wallets" ADD CONSTRAINT "case_wallets_case_entity_fk" FOREIGN KEY ("case_id","entity_id") REFERENCES "public"."entities"("case_id","id") ON DELETE restrict ON UPDATE no action NOT VALID;--> statement-breakpoint
CREATE UNIQUE INDEX "case_wallets_case_wallet_key" ON "case_wallets" USING btree ("case_id","wallet_id");--> statement-breakpoint
CREATE INDEX "case_wallets_case_idx" ON "case_wallets" USING btree ("case_id");--> statement-breakpoint
CREATE UNIQUE INDEX "wallet_assets_chain_address_key" ON "wallet_assets" USING btree ("chain","address");--> statement-breakpoint
ALTER TABLE "entity_relations" ADD CONSTRAINT "entity_relations_case_from_entity_fk" FOREIGN KEY ("case_id","from_entity_id") REFERENCES "public"."entities"("case_id","id") ON DELETE cascade ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "entity_relations" ADD CONSTRAINT "entity_relations_case_to_entity_fk" FOREIGN KEY ("case_id","to_entity_id") REFERENCES "public"."entities"("case_id","id") ON DELETE cascade ON UPDATE no action NOT VALID;
--> statement-breakpoint
ALTER TABLE "case_wallets" VALIDATE CONSTRAINT "case_wallets_case_entity_fk";
--> statement-breakpoint
ALTER TABLE "entity_relations" VALIDATE CONSTRAINT "entity_relations_case_from_entity_fk";
--> statement-breakpoint
ALTER TABLE "entity_relations" VALIDATE CONSTRAINT "entity_relations_case_to_entity_fk";
