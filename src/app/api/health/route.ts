import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db/client";

export const dynamic = "force-dynamic";

export async function GET() {
  const databaseConfigured = Boolean(process.env.DATABASE_URL);
  if (!databaseConfigured) {
    return NextResponse.json(
      {
        status: "degraded",
        ...(process.env.NODE_ENV === "production"
          ? {}
          : { services: { databaseConfigured: false, databaseReachable: false } }),
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    await db().execute(sql`select 1 as ok`);
    return NextResponse.json(
      {
        status: "ok",
        ...(process.env.NODE_ENV === "production"
          ? {}
          : {
              services: {
                databaseConfigured: true,
                databaseReachable: true,
                pinataConfigured: Boolean(process.env.PINATA_JWT),
                clerkConfigured: Boolean(
                  process.env.CLERK_SECRET_KEY &&
                    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
                ),
              },
            }),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Database readiness check failed", error);
    return NextResponse.json(
      {
        status: "degraded",
        ...(process.env.NODE_ENV === "production"
          ? {}
          : { services: { databaseConfigured: true, databaseReachable: false } }),
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
