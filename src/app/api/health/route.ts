import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ status: "ok" });
  }

  return NextResponse.json({
    status: "ok",
    services: {
      databaseConfigured: Boolean(process.env.DATABASE_URL),
      pinataConfigured: Boolean(process.env.PINATA_JWT),
      clerkConfigured: Boolean(
        process.env.CLERK_SECRET_KEY &&
          process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
      ),
    },
  });
}
