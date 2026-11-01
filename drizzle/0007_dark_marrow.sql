ALTER TABLE "cases" ADD COLUMN "workflow_note" text;
--> statement-breakpoint
UPDATE "cases" AS c
SET "created_by" = s."submitter_id"
FROM "case_submissions" AS s
WHERE s."accepted_case_id" = c."id";
--> statement-breakpoint
UPDATE "case_members" AS m
SET "role" = 'owner', "updated_at" = now()
FROM "case_submissions" AS s
WHERE
  s."accepted_case_id" = m."case_id"
  AND s."submitter_id" = m."user_id";
