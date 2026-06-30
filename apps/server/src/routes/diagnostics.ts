import { randomUUID } from "node:crypto";

import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Pool } from "pg";

import type { AppConfig } from "../config.js";
import type { AppServices } from "../repositories/types.js";

type DiagnosticsPool = Pick<Pool, "query">;

const REQUIRED_COLUMNS = {
  sessions: [
    "owner_user_id",
    "current_selected_node_id",
    "last_executed_target_node_id"
  ],
  tree_nodes: ["suggested_followups"],
  tree_operations: [
    "affected_child_group_id",
    "deleted_node_ids",
    "undo_of_operation_id",
    "redo_of_operation_id"
  ]
} as const;

export async function registerDiagnosticsRoutes(
  app: FastifyInstance,
  config: AppConfig,
  services: AppServices,
  pool: DiagnosticsPool | null
): Promise<void> {
  app.get("/api/diagnostics", async (request, reply) => {
    if (!isDiagnosticsAuthorized(request, config)) {
      return reply.status(404).send({
        error: {
          code: "NOT_FOUND",
          message: "Not found"
        }
      });
    }

    return {
      runtime: {
        nodeEnv: config.nodeEnv,
        persistenceMode: services.persistenceMode,
        agentProvider: config.agentProvider,
        hasDatabaseUrl: Boolean(config.databaseUrl),
        databaseHost: config.databaseUrl ? readDatabaseHost(config.databaseUrl) : null,
        databaseSslMode: config.databaseUrl ? readDatabaseSslMode(config.databaseUrl) : null,
        hasSiliconFlowApiKey: Boolean(config.siliconFlowApiKey),
        hasSupabaseUrl: Boolean(config.supabaseUrl),
        hasSupabaseJwtSecret: Boolean(config.supabaseJwtSecret)
      },
      database:
        services.persistenceMode === "postgres" && pool
          ? await inspectPostgres(pool)
          : null
    };
  });
}

function isDiagnosticsAuthorized(
  request: FastifyRequest,
  config: AppConfig
): boolean {
  if (config.nodeEnv !== "production") {
    return true;
  }

  if (!config.diagnosticsToken) {
    return false;
  }

  const headerToken = request.headers["x-diagnostics-token"];
  const queryToken =
    typeof request.query === "object" &&
    request.query !== null &&
    "token" in request.query
      ? String(request.query.token)
      : null;

  return headerToken === config.diagnosticsToken || queryToken === config.diagnosticsToken;
}

async function inspectPostgres(pool: DiagnosticsPool): Promise<Record<string, unknown>> {
  try {
    const [identity, columns, constraints, smoke] = await Promise.all([
      inspectIdentity(pool),
      inspectColumns(pool),
      inspectConstraints(pool),
      runWriteSmokeTest(pool)
    ]);

    return {
      ok: smoke.ok,
      identity,
      columns,
      constraints,
      writeSmokeTest: smoke
    };
  } catch (error) {
    return {
      ok: false,
      error: serializeError(error)
    };
  }
}

async function inspectIdentity(pool: DiagnosticsPool): Promise<Record<string, unknown>> {
  const result = await pool.query(
    "select current_database() as database, current_schema() as schema, current_user as user"
  );
  return result.rows[0] ?? {};
}

async function inspectColumns(pool: DiagnosticsPool): Promise<Record<string, unknown>> {
  const result = await pool.query(
    `
      select table_name, column_name
      from information_schema.columns
      where table_schema = 'public'
        and table_name = any($1::text[])
      order by table_name, column_name
    `,
    [Object.keys(REQUIRED_COLUMNS)]
  );
  const found = new Map<string, Set<string>>();

  for (const row of result.rows) {
    const tableName = String(row.table_name);
    const columnName = String(row.column_name);
    const columns = found.get(tableName) ?? new Set<string>();
    columns.add(columnName);
    found.set(tableName, columns);
  }

  return Object.fromEntries(
    Object.entries(REQUIRED_COLUMNS).map(([tableName, requiredColumns]) => [
      tableName,
      {
        ok: requiredColumns.every((column) => found.get(tableName)?.has(column)),
        missing: requiredColumns.filter((column) => !found.get(tableName)?.has(column))
      }
    ])
  );
}

async function inspectConstraints(pool: DiagnosticsPool): Promise<unknown[]> {
  const result = await pool.query(
    `
      select conrelid::regclass::text as table_name, conname, pg_get_constraintdef(oid) as definition
      from pg_constraint
      where conrelid in (
        'public.messages'::regclass,
        'public.generation_tasks'::regclass,
        'public.tree_operations'::regclass
      )
      order by table_name, conname
    `
  );

  return result.rows;
}

async function runWriteSmokeTest(
  pool: DiagnosticsPool
): Promise<{ ok: true } | { ok: false; error: Record<string, unknown> }> {
  const sessionId = randomUUID();

  try {
    await pool.query("begin");
    await pool.query(
      `
        insert into public.sessions (
          id,
          owner_user_id,
          title,
          goal,
          product_domain,
          status,
          current_selected_node_id,
          last_executed_target_node_id,
          pending_node_id,
          last_mentioned_node_id,
          next_public_node_number,
          created_at,
          updated_at
        )
        values (
          $1,
          'diagnostics',
          'diagnostic smoke',
          'diagnostic smoke',
          'industrial_design',
          'active',
          null,
          null,
          null,
          null,
          1,
          now(),
          now()
        )
      `,
      [sessionId]
    );
    await pool.query("rollback");
    return { ok: true };
  } catch (error) {
    try {
      await pool.query("rollback");
    } catch {
      // Keep the original failure visible.
    }

    return {
      ok: false,
      error: serializeError(error)
    };
  }
}

function readDatabaseHost(databaseUrl: string): string | null {
  try {
    return new URL(databaseUrl).host;
  } catch {
    return "invalid-url";
  }
}

function readDatabaseSslMode(databaseUrl: string): string | null {
  try {
    return new URL(databaseUrl).searchParams.get("sslmode");
  } catch {
    return null;
  }
}

function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      code:
        "code" in error && typeof error.code === "string"
          ? error.code
          : undefined
    };
  }

  return {
    message: String(error)
  };
}
