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
