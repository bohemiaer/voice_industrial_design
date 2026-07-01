import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

const readJson = (filePath) => {
  const content = fs.readFileSync(filePath, "utf8");
  return JSON.parse(content);
};

test("workspace scaffold includes root package and pnpm workspace config", () => {
  const packageJsonPath = path.join(root, "package.json");
  const workspacePath = path.join(root, "pnpm-workspace.yaml");

  assert.equal(fs.existsSync(packageJsonPath), true);
  assert.equal(fs.existsSync(workspacePath), true);

  const packageJson = readJson(packageJsonPath);
  assert.equal(packageJson.private, true);
  assert.equal(typeof packageJson.scripts.test, "string");
});

test("web, server, and shared packages exist with package names", () => {
  const webPackage = readJson(path.join(root, "apps", "web", "package.json"));
  const serverPackage = readJson(path.join(root, "apps", "server", "package.json"));
  const sharedPackage = readJson(path.join(root, "packages", "shared", "package.json"));

  assert.equal(webPackage.name, "@voice-industrial-design/web");
  assert.equal(serverPackage.name, "@voice-industrial-design/server");
  assert.equal(sharedPackage.name, "@voice-industrial-design/shared");
});

test("database migrations include columns required by the current server schema", () => {
  const migrationSql = fs
    .readdirSync(path.join(root, "infra", "migrations"))
    .filter((fileName) => fileName.endsWith(".sql"))
    .sort()
    .map((fileName) =>
      fs.readFileSync(path.join(root, "infra", "migrations", fileName), "utf8")
    )
    .join("\n");

  for (const columnName of [
    "owner_user_id",
    "current_selected_node_id",
    "last_executed_target_node_id",
    "child_group_id",
    "suggested_followups",
    "affected_child_group_id",
    "deleted_node_ids",
    "undo_of_operation_id",
    "redo_of_operation_id"
  ]) {
    assert.match(migrationSql, new RegExp(`\\b${columnName}\\b`));
  }

  for (const enumValue of [
    "diverge",
    "refresh",
    "delete",
    "redo",
    "intent",
    "chat",
    "node_explanation",
    "memory_summary"
  ]) {
    assert.match(migrationSql, new RegExp(`'${enumValue}'`));
  }
});
