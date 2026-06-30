import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import type { AppConfig } from "../config.js";
import * as schema from "./schema.js";

export type ServerDatabase = NodePgDatabase<typeof schema>;

export function createDatabase(config: AppConfig): {
  db: ServerDatabase;
  pool: Pool;
} {
  if (!config.databaseUrl) {
    throw new Error("DATABASE_URL is required for postgres persistence mode");
  }

  const pool = new Pool({
    connectionString: config.databaseUrl,
    ssl: shouldUseSsl(config.databaseUrl)
      ? {
          rejectUnauthorized: false
        }
      : undefined
  });

  return {
    db: drizzle(pool, { schema }),
    pool
  };
}

function shouldUseSsl(databaseUrl: string): boolean {
  const parsed = new URL(databaseUrl);
  const sslMode = parsed.searchParams.get("sslmode");

  if (sslMode === "disable") {
    return false;
  }

  if (["require", "verify-ca", "verify-full", "no-verify"].includes(sslMode ?? "")) {
    return true;
  }

  return !/^(localhost|127\.0\.0\.1|\[::1\])$/i.test(parsed.hostname);
}
