import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const configEntry = pathToFileURL(
  path.join(process.cwd(), "apps", "server", "dist", "config.js")
).href;

test("loadConfig reads SiliconFlow settings from a dotenv file", async () => {
  const { loadConfig } = await import(configEntry);
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "voice-config-"));
  const envPath = path.join(tempDir, ".env");
  await fs.writeFile(
    envPath,
    [
      "AGENT_PROVIDER=siliconflow",
      "SILICONFLOW_API_KEY=test-key",
      "SILICONFLOW_BASE_URL=https://api.example.test/v1",
      "SILICONFLOW_ASR_MODEL=asr-model",
      "SILICONFLOW_BRAINSTORM_MODEL=brainstorm-model",
      "SILICONFLOW_IMAGE_MODEL=image-model"
    ].join("\n")
  );

  const config = loadConfig({}, envPath);

  assert.equal(config.agentProvider, "siliconflow");
  assert.equal(config.siliconFlowApiKey, "test-key");
  assert.equal(
    config.siliconFlowBaseUrl,
    "https://api.example.test/v1"
  );
  assert.equal(config.siliconFlowAsrModel, "asr-model");
  assert.equal(config.siliconFlowBrainstormModel, "brainstorm-model");
  assert.equal(config.siliconFlowImageModel, "image-model");
});

test("loadConfig finds a parent dotenv file when server starts from a package directory", async () => {
  const { loadConfig } = await import(`${configEntry}?parent-dotenv=${Date.now()}`);
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "voice-config-root-"));
  const packageDir = path.join(tempRoot, "apps", "server");
  await fs.mkdir(packageDir, { recursive: true });
  await fs.writeFile(path.join(tempRoot, ".env"), "AGENT_PROVIDER=siliconflow\n");

  const previousCwd = process.cwd();
  try {
    process.chdir(packageDir);
    assert.equal(loadConfig({}).agentProvider, "siliconflow");
  } finally {
    process.chdir(previousCwd);
  }
});

test("loadConfig selects a preview-friendly persistence mode", async () => {
  const { loadConfig } = await import(`${configEntry}?persistence=${Date.now()}`);
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "voice-config-"));
  const envPath = path.join(tempDir, ".env");
  await fs.writeFile(envPath, "");

  assert.equal(
    loadConfig({ NODE_ENV: "development" }, envPath).persistenceMode,
    "memory"
  );
  assert.equal(
    loadConfig({
      NODE_ENV: "development",
      DATABASE_URL: "postgresql://example"
    }, envPath).persistenceMode,
    "postgres"
  );
  assert.equal(
    loadConfig({
      NODE_ENV: "development",
      PERSISTENCE_MODE: "postgres"
    }, envPath).persistenceMode,
    "postgres"
  );
});
