export type PersistenceMode = "postgres" | "memory";

export interface AppConfig {
  nodeEnv: string;
  serverPort: number;
  databaseUrl: string | null;
  defaultBranchCount: number;
  maxBranchCount: number;
  sessionDomain: "industrial_design";
}

export function loadConfig(): AppConfig {
  return {
    nodeEnv: process.env.NODE_ENV ?? "development",
    serverPort: Number(process.env.SERVER_PORT ?? 8787),
    databaseUrl: process.env.DATABASE_URL ?? null,
    defaultBranchCount: Number(process.env.DEFAULT_BRANCH_COUNT ?? 4),
    maxBranchCount: Number(process.env.MAX_BRANCH_COUNT ?? 4),
    sessionDomain: "industrial_design"
  };
}
