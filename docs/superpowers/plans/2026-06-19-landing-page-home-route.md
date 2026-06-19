# Landing Page Home Route Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `/` route with a product landing page and move the existing brainstorming workbench to `/workbench` without regressing the current workspace UI.

**Architecture:** Keep the current React Flow workbench intact by moving its page shell into a dedicated route, then implement a static marketing-style homepage that links directly into that route. Update global styling only where needed so the new landing page and existing workbench can coexist.

**Tech Stack:** Next.js App Router, React, existing global CSS, Node test runner

---

### Task 1: Lock the new route behavior with tests

**Files:**
- Modify: `tests/web/workbench-page.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
const pageSource = read("apps", "web", "src", "app", "page.tsx");
const workbenchPageSource = read("apps", "web", "src", "app", "workbench", "page.tsx");

test("home page presents the landing hero and routes the primary action to the workbench", () => {
  assert.match(pageSource, /把模糊需求，展开成一棵清晰的概念树/);
  assert.match(pageSource, /href="\/workbench"/);
});

test("workbench route is composed from dedicated frontend components", () => {
  assert.match(workbenchPageSource, /ReactFlowProvider/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests\web\workbench-page.test.mjs`
Expected: FAIL with `ENOENT` for `apps\web\src\app\workbench\page.tsx`

- [ ] **Step 3: Write minimal implementation**

```tsx
export default function HomePage() {
  return <a href="/workbench">立即体验</a>;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests\web\workbench-page.test.mjs`
Expected: PASS for the new homepage and workbench-route assertions

### Task 2: Move the existing workbench to `/workbench`

**Files:**
- Create: `apps/web/src/app/workbench/page.tsx`
- Modify: `apps/web/src/app/page.tsx`

- [ ] **Step 1: Move the current workbench shell into the dedicated route**

```tsx
export default function WorkbenchPage() {
  return (
    <ReactFlowProvider>
      <WorkbenchPageShell />
    </ReactFlowProvider>
  );
}
```

- [ ] **Step 2: Replace the root route with the landing page content**

```tsx
<Link href="/workbench" className="landing-hero__primary">
  立即体验
</Link>
```

- [ ] **Step 3: Run the focused test file**

Run: `node --test tests\web\workbench-page.test.mjs`
Expected: PASS

### Task 3: Add landing page styling and verify type safety

**Files:**
- Modify: `apps/web/src/app/globals.css`
- Modify: `apps/web/src/app/layout.tsx`

- [ ] **Step 1: Add landing page layout and responsive styles**

```css
.landing-page {
  min-height: 100vh;
}

.landing-hero__primary {
  display: inline-flex;
}
```

- [ ] **Step 2: Update metadata to match the landing page positioning**

```tsx
export const metadata = {
  title: "概念树工作台",
  description: "面向工业设计前期概念探索的可视化工作台。"
};
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm --filter @voice-industrial-design/web typecheck`
Expected: PASS

- [ ] **Step 4: Run the focused web tests again**

Run: `node --test tests\web\workbench-page.test.mjs`
Expected: PASS
