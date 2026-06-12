import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const previewPath = path.join(process.cwd(), "preview", "index.html");

test("preview includes approved workbench structure and panel toggle hooks", () => {
  const html = fs.readFileSync(previewPath, "utf8");

  assert.match(html, /data-testid="workbench-shell"/);
  assert.match(html, /data-testid="canvas-panel"/);
  assert.match(html, /data-testid="conversation-panel"/);
  assert.match(html, /data-testid="voice-dock"/);
  assert.match(html, /Precision Lab/);
  assert.match(html, /当前目标节点/);
  assert.match(html, /新增 3 个同级方向/);
  assert.match(html, /方向 12/);
  assert.match(html, /data-action="toggle-panel"/);
  assert.match(html, /data-panel-state="expanded"/);
});
