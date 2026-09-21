import { db } from "@/db/client";
import { caseRecords } from "@/db/schema";

async function seed() {
  await db()
    .insert(caseRecords)
    .values({
      code: "CRN-2026-0703",
      titleZh: "CRN — 案件与追偿网络",
      titleEn: "CRN — Case & Recovery Network",
      summaryZh: "公开档案的受控数据迁移起点。",
      summaryEn: "Controlled data-migration starting point for the public archive.",
      isPublic: true,
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
