# HTML Preview Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a first-pass static HTML preview of the Voice Painting workbench based on the approved design and product spec.

**Architecture:** Use a tiny static preview surface with one HTML file plus focused CSS and JS assets. The page will simulate a realistic workbench state: concept tree canvas on the left, collapsible conversation/status panel on the right, floating toolbar, and voice input dock.

**Tech Stack:** HTML, CSS, vanilla JavaScript, Node built-in test runner

---

### Task 1: Freeze the preview structure contract

**Files:**
- Create: `D:\Users\HCI_lab\Documents\voice-painting\tests\preview\workbench-preview.test.mjs`
- Create: `D:\Users\HCI_lab\Documents\voice-painting\preview\index.html`

- [ ] **Step 1: Write the failing test**

```js
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("preview includes workbench landmarks", () => {
  const html = fs.readFileSync("preview/index.html", "utf8");

  assert.match(html, /data-testid="workbench-shell"/);
  assert.match(html, /data-testid="canvas-panel"/);
  assert.match(html, /data-testid="conversation-panel"/);
  assert.match(html, /data-testid="voice-dock"/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/preview/workbench-preview.test.mjs`
Expected: FAIL because `preview/index.html` does not exist yet.

- [ ] **Step 3: Create the minimal HTML shell**

```html
<main data-testid="workbench-shell">
  <section data-testid="canvas-panel"></section>
  <aside data-testid="conversation-panel"></aside>
  <div data-testid="voice-dock"></div>
</main>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/preview/workbench-preview.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/preview/workbench-preview.test.mjs preview/index.html
git commit -m "test: add workbench preview structure contract"
```

### Task 2: Add the approved visual system

**Files:**
- Modify: `D:\Users\HCI_lab\Documents\voice-painting\preview\index.html`
- Create: `D:\Users\HCI_lab\Documents\voice-painting\preview\styles.css`

- [ ] **Step 1: Expand the failing test with approved sections**

```js
assert.match(html, /Precision Lab/);
assert.match(html, /当前目标节点/);
assert.match(html, /新增 3 个同级方向/);
assert.match(html, /方向 12/);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/preview/workbench-preview.test.mjs`
Expected: FAIL because the semantic content is missing.

- [ ] **Step 3: Add the visual layout and content**

```html
<header class="floating-toolbar">...</header>
<section class="canvas-stage">...</section>
<aside class="conversation-panel">...</aside>
```

```css
:root {
  --bg: #f3f5f7;
  --panel: rgba(255, 255, 255, 0.92);
  --border: #d7e0e7;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/preview/workbench-preview.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add preview/index.html preview/styles.css tests/preview/workbench-preview.test.mjs
git commit -m "feat: add precision lab preview styling"
```

### Task 3: Add interaction polish and local preview handoff

**Files:**
- Modify: `D:\Users\HCI_lab\Documents\voice-painting\preview\index.html`
- Create: `D:\Users\HCI_lab\Documents\voice-painting\preview\app.js`

- [ ] **Step 1: Expand the failing test for collapsible panel hooks**

```js
assert.match(html, /data-action="toggle-panel"/);
assert.match(html, /data-panel-state="expanded"/);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/preview/workbench-preview.test.mjs`
Expected: FAIL because the collapse controls are missing.

- [ ] **Step 3: Add the minimal JS behavior**

```js
const shell = document.querySelector("[data-workbench]");
const toggle = document.querySelector("[data-action='toggle-panel']");

toggle.addEventListener("click", () => {
  shell.dataset.panelState =
    shell.dataset.panelState === "expanded" ? "collapsed" : "expanded";
});
```

- [ ] **Step 4: Run test and preview verification**

Run: `node --test tests/preview/workbench-preview.test.mjs`
Expected: PASS

Run: `python -m http.server 4173 --directory preview`
Expected: local preview available at `http://localhost:4173`

- [ ] **Step 5: Commit**

```bash
git add preview/index.html preview/styles.css preview/app.js tests/preview/workbench-preview.test.mjs
git commit -m "feat: add interactive html preview workbench"
```
