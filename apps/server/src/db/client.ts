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
    connectionString: config.databaseUrl
  });

  return {
    db: drizzle(pool, { schema }),
    pool
  };
}
