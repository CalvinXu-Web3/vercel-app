import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "@/db/schema";
import { HttpError } from "@/lib/http";

export function db() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new HttpError(503, "Database is not configured.");
  }

  return drizzle({ client: neon(databaseUrl), schema });
}
