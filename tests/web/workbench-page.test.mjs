import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const gitignorePath = path.join(process.cwd(), ".gitignore");
const pagePath = path.join(process.cwd(), "apps", "web", "src", "app", "page.tsx");
const todoPath = path.join(process.cwd(), "TODO.md");

test("gitignore excludes the frontend reference workspace", () => {
  const gitignore = fs.readFileSync(gitignorePath, "utf8");

  assert.match(gitignore, /^frontend-refer\/$/m);
});

test("workbench page is wired as an interactive client component", () => {
  const pageSource = fs.readFileSync(pagePath, "utf8");

  assert.match(pageSource, /^"use client";/m);
  assert.match(pageSource, /useState/);
  assert.match(pageSource, /selectedNodeId/);
  assert.match(pageSource, /data-testid=\{`node-button-\$\{node\.id\}`\}/);
  assert.match(pageSource, /onClick=\{\(\) => setSelectedNodeId\(node\.id\)\}/);
});

test("workbench page uses collapsed system logs instead of centered status bubbles", () => {
  const pageSource = fs.readFileSync(pagePath, "utf8");

  assert.doesNotMatch(pageSource, /sidebar-chip/);
  assert.match(pageSource, /<details className="system-log"/);
  assert.match(pageSource, /<summary>\{summary \?\? message\.content\}<\/summary>/);
  assert.match(pageSource, /className="sidebar-scroll-region"/);
});

test("workbench page consumes shared frontend contract types", () => {
  const pageSource = fs.readFileSync(pagePath, "utf8");

  assert.match(
    pageSource,
    /import type\s*\{[\s\S]*BrainstormActionType,[\s\S]*Message,[\s\S]*Session,[\s\S]*TreeNode[\s\S]*\}\s*from "@voice-industrial-design\/shared"/
  );
  assert.match(pageSource, /const mockSession: Session =/);
  assert.match(pageSource, /const mockMessages: MessageViewModel\[] =/);
  assert.match(pageSource, /const mockTreeNodes: TreeNode\[] =/);
  assert.match(pageSource, /role: "assistant"/);
  assert.doesNotMatch(pageSource, /role: "user" \| "system" \| "ai"/);
  assert.doesNotMatch(pageSource, /type ConceptNode =/);
});

test("todo reflects that the mock frontend prototype is in place", () => {
  const todo = fs.readFileSync(todoPath, "utf8");

  assert.match(todo, /- \[x\] 搭建 `Next\.js` 基础页面/);
  assert.match(todo, /- \[x\] 接入基础样式/);
  assert.match(todo, /- \[x\] 用 mock 数据跑通首轮生成页面/);
  assert.match(todo, /- \[x\] 用 mock 数据跑通高风险确认页面/);
  assert.match(todo, /- \[x\] 用 mock 数据跑通节点选中页面/);
});
