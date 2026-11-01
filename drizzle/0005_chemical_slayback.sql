CREATE TABLE "case_publications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"content_hash" varchar(128) NOT NULL,
	"published_by" varchar(255) NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "current_published_version" integer;--> statement-breakpoint
ALTER TABLE "case_publications" ADD CONSTRAINT "case_publications_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "case_publications_case_version_key" ON "case_publications" USING btree ("case_id","version");--> statement-breakpoint
CREATE INDEX "case_publications_published_idx" ON "case_publications" USING btree ("published_at");--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS "pgcrypto";--> statement-breakpoint
WITH "legacy_publications" AS (
	SELECT
		"id" AS "case_id",
		"updated_at" AS "published_at",
		jsonb_build_object(
			'case', jsonb_build_object(
				'code', "code",
				'titleZh', "title_zh",
				'titleEn', "title_en",
				'summaryZh', "summary_zh",
				'summaryEn', "summary_en",
				'status', 'published',
				'updatedAt', "updated_at",
				'publishedAt', "updated_at"
			),
			'timeline', '[]'::jsonb,
			'entities', '[]'::jsonb,
			'relations', '[]'::jsonb,
			'wallets', '[]'::jsonb
		) AS "snapshot"
	FROM "cases"
	WHERE "is_public" = true AND "status" = 'published'
)
INSERT INTO "case_publications" (
	"case_id", "version", "snapshot", "content_hash", "published_by", "published_at"
)
SELECT
	"case_id",
	1,
	"snapshot",
	encode(digest("snapshot"::text, 'sha256'), 'hex'),
	'system',
	"published_at"
FROM "legacy_publications";--> statement-breakpoint
UPDATE "cases"
SET "current_published_version" = 1, "visibility" = 'public'
WHERE "is_public" = true AND "status" = 'published';
