import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export type PersistenceMode = "postgres" | "memory";
export type AgentProvider = "mock" | "siliconflow";

export interface AppConfig {
  nodeEnv: string;
  serverPort: number;
  databaseUrl: string | null;
  persistenceMode: PersistenceMode;
  agentProvider: AgentProvider;
  deepSeekApiKey: string | null;
  deepSeekBaseUrl: string | null;
  deepSeekBrainstormModel: string | null;
  deepSeekImagePromptModel: string | null;
  imagePromptWriterEnabled: boolean;
  siliconFlowApiKey: string | null;
  siliconFlowBaseUrl: string | null;
  siliconFlowAsrModel: string | null;
  siliconFlowBrainstormModel: string | null;
  siliconFlowImageModel: string | null;
  siliconFlowChatModel: string | null;
  supabaseUrl: string | null;
  supabaseJwtSecret: string | null;
  supabaseJwtAudience: string;
  diagnosticsToken: string | null;
  defaultBranchCount: number;
  maxBranchCount: number;
  sessionDomain: "industrial_design";
}

function parseAgentProvider(value: string | undefined): AgentProvider {
  if (value === "siliconflow") {
    return "siliconflow";
  }

  return "mock";
}

function parsePersistenceMode(
  value: string | undefined,
  databaseUrl: string | null,
  nodeEnv: string
): PersistenceMode {
  if (value === "memory" || value === "postgres") {
    return value;
  }

  if (databaseUrl || nodeEnv === "production") {
    return "postgres";
  }

  return "memory";
}

export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
  envFilePath = findDotEnvFile(process.cwd())
): AppConfig {
  const dotenv = readDotEnvFile(envFilePath);
  const mergedEnv = {
    ...dotenv,
    ...env
  };

  const nodeEnv = mergedEnv.NODE_ENV ?? "development";
  const databaseUrl = mergedEnv.DATABASE_URL ?? null;

  return {
    nodeEnv,
    serverPort: Number(mergedEnv.SERVER_PORT ?? 8787),
    databaseUrl,
    persistenceMode: parsePersistenceMode(
      mergedEnv.PERSISTENCE_MODE,
      databaseUrl,
      nodeEnv
    ),
    agentProvider: parseAgentProvider(mergedEnv.AGENT_PROVIDER),
    deepSeekApiKey: mergedEnv.DEEPSEEK_API_KEY ?? null,
    deepSeekBaseUrl: mergedEnv.DEEPSEEK_BASE_URL ?? null,
    deepSeekBrainstormModel:
      mergedEnv.DEEPSEEK_BRAINSTORM_MODEL ??
      mergedEnv.DEEPSEEK_MODEL ??
      null,
    deepSeekImagePromptModel:
      mergedEnv.DEEPSEEK_IMAGE_PROMPT_MODEL ??
      mergedEnv.DEEPSEEK_BRAINSTORM_MODEL ??
      mergedEnv.DEEPSEEK_MODEL ??
      null,
    imagePromptWriterEnabled:
      parseBoolean(mergedEnv.IMAGE_PROMPT_WRITER_ENABLED) ?? false,
    siliconFlowApiKey: mergedEnv.SILICONFLOW_API_KEY ?? null,
    siliconFlowBaseUrl: mergedEnv.SILICONFLOW_BASE_URL ?? null,
    siliconFlowAsrModel: mergedEnv.SILICONFLOW_ASR_MODEL ?? null,
    siliconFlowBrainstormModel: mergedEnv.SILICONFLOW_BRAINSTORM_MODEL ?? null,
    siliconFlowImageModel: mergedEnv.SILICONFLOW_IMAGE_MODEL ?? null,
    siliconFlowChatModel:
      mergedEnv.SILICONFLOW_CHAT_MODEL ??
      mergedEnv.SILICONFLOW_BRAINSTORM_MODEL ??
      null,
    supabaseUrl: mergedEnv.SUPABASE_URL ?? null,
    supabaseJwtSecret: mergedEnv.SUPABASE_JWT_SECRET ?? null,
    supabaseJwtAudience: mergedEnv.SUPABASE_JWT_AUDIENCE ?? "authenticated",
    diagnosticsToken: mergedEnv.DIAGNOSTICS_TOKEN ?? null,
    defaultBranchCount: Number(mergedEnv.DEFAULT_BRANCH_COUNT ?? 3),
    maxBranchCount: Number(mergedEnv.MAX_BRANCH_COUNT ?? 4),
    sessionDomain: "industrial_design"
  };
}

function parseBoolean(value: string | undefined): boolean | null {
  if (value === undefined) {
    return null;
  }

  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function findDotEnvFile(startDir: string): string {
  let currentDir = resolve(startDir);

  while (true) {
    const candidate = resolve(currentDir, ".env");

    if (existsSync(candidate)) {
      return candidate;
    }

    const parentDir = dirname(currentDir);

    if (parentDir === currentDir) {
      return candidate;
    }

    currentDir = parentDir;
  }
}

function readDotEnvFile(envFilePath: string): Record<string, string> {
  if (!existsSync(envFilePath)) {
    return {};
  }

  return readFileSync(envFilePath, "utf8")
    .split(/\r?\n/)
    .reduce<Record<string, string>>((accumulator, line) => {
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith("#")) {
        return accumulator;
      }

      const separatorIndex = trimmed.indexOf("=");

      if (separatorIndex === -1) {
        return accumulator;
      }

      const key = trimmed.slice(0, separatorIndex).trim();
      const rawValue = trimmed.slice(separatorIndex + 1).trim();
      accumulator[key] = stripQuotes(rawValue);
      return accumulator;
    }, {});
}

function stripQuotes(value: string): string {
  if (
    (value.startsWith("\"") && value.endsWith("\"")) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}
