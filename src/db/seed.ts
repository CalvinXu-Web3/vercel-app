import { db } from "@/db/client";
import { caseRecords, organizations } from "@/db/schema";

const systemOrganizationId = "00000000-0000-4000-8000-000000000001";

async function seed() {
  const database = db();
  await database
    .insert(organizations)
    .values({
      id: systemOrganizationId,
      slug: "crn-review",
      name: "CRN Review Workspace",
      createdBy: "system",
    })
    .onConflictDoNothing({ target: organizations.slug });
  await database
    .insert(caseRecords)
    .values({
      organizationId: systemOrganizationId,
      createdBy: "system",
      code: "CRN-2026-0703",
      titleZh: "CRN — 案件与追偿网络",
      titleEn: "CRN — Case & Recovery Network",
      summaryZh: "公开档案的受控数据迁移起点。",
      summaryEn: "Controlled data-migration starting point for the public archive.",
      isPublic: true,
      visibility: "public",
      status: "published",
    })
    .onConflictDoNothing();
}

seed()
  .then(() => {
    console.info("Seed completed.");
  })
  .catch((error: unknown) => {
    console.error("Seed failed.", error);
    process.exitCode = 1;
  });
