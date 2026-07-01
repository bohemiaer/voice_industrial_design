# Workbench API Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a mandatory workbench API setup modal that blocks interaction until a SiliconFlow API key is saved locally, and make that saved key available to the backend request path.

**Architecture:** Gate the workbench at the page shell so session initialization waits until a browser-stored API key exists. Pass the saved key through the frontend API client as a dedicated request header, then let the backend orchestrator/gateway use a per-request SiliconFlow key override instead of only global env config.

**Tech Stack:** Next.js App Router, Zustand, Fastify, TypeScript, node:test

---

### Task 1: Lock In Regression Coverage

**Files:**
- Modify: `tests/web/workbench-page.test.mjs`
- Modify: `tests/server/api.test.mjs`

- [ ] Add source-level frontend assertions for a blocking API modal, local storage key, and delayed `initializeApiSession()` behavior.
- [ ] Add a backend request-path test that proves a SiliconFlow API key can be forwarded per request and observed by the agent gateway.
- [ ] Run the focused tests and confirm they fail for the missing gate/header behavior.

### Task 2: Add Frontend API Gate

**Files:**
- Modify: `apps/web/src/app/workbench/page.tsx`
- Create: `apps/web/src/features/workbench/components/ApiKeyGateDialog.tsx`
- Modify: `apps/web/src/features/workbench/api.ts`

- [ ] Add a dedicated local-storage key constant and browser read/write helpers in the page shell.
- [ ] Delay workbench session initialization until a saved key exists.
- [ ] Render a non-dismissible overlay modal with helper copy, link, API input, inline validation, and save CTA.
- [ ] Feed the saved key into the API client via a dedicated SiliconFlow API key provider.

### Task 3: Support Per-Request SiliconFlow Keys In The Backend

**Files:**
- Modify: `apps/server/src/agents/types.ts`
- Modify: `apps/server/src/agents/siliconflow.ts`
- Modify: `apps/server/src/orchestrator/service.ts`
- Modify: `apps/server/src/routes/sessions.ts`
- Modify: `apps/server/src/app.ts`

- [ ] Add a request-scoped SiliconFlow API key override shape to the agent gateway interface.
- [ ] Forward a custom request header from the session/transcription routes into orchestrator calls.
- [ ] Use the override inside SiliconFlow auth header generation while preserving existing env-based fallback behavior.
- [ ] Allow the custom header through CORS.

### Task 4: Match Workbench Styling

**Files:**
- Modify: `apps/web/src/app/globals.css`

- [ ] Add overlay, modal, field, helper text, and CTA styles that reuse the workbench surface language.
- [ ] Ensure the overlay blocks pointer interaction beneath it and stays visually consistent with the existing shell.

### Task 5: Verify End To End

**Files:**
- Verify: `apps/web/src/app/workbench/page.tsx`
- Verify: `apps/web/src/features/workbench/components/ApiKeyGateDialog.tsx`
- Verify: `apps/web/src/features/workbench/api.ts`
- Verify: `apps/server/src/routes/sessions.ts`
- Verify: `apps/server/src/orchestrator/service.ts`
- Verify: `apps/server/src/agents/siliconflow.ts`

- [ ] Run focused tests for web/server coverage.
- [ ] Run `corepack pnpm --filter @voice-industrial-design/web typecheck` and `corepack pnpm --filter @voice-industrial-design/server build`.
- [ ] Verify in the browser that `/workbench` shows the blocking modal without a saved key, saves locally, then unlocks and initializes.
