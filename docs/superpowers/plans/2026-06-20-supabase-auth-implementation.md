# Supabase Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Supabase Auth to protect the workbench and associate newly created sessions with the authenticated user.

**Architecture:** The web app signs users in with `@supabase/supabase-js` and attaches Supabase access tokens to API calls. The Fastify server validates JWTs, injects the current user, and enforces ownership through the session repository.

**Tech Stack:** Next.js 14, React 18, Fastify 5, TypeScript, Supabase Auth, Node test runner.

---

### Task 1: Server Auth And Ownership

**Files:**
- Create: `apps/server/src/auth.ts`
- Modify: `apps/server/src/app.ts`
- Modify: `apps/server/src/config.ts`
- Modify: `apps/server/src/routes/sessions.ts`
- Modify: `apps/server/src/routes/tasks.ts`
- Modify: `apps/server/src/repositories/types.ts`
- Modify: `apps/server/src/repositories/memory.ts`
- Modify: `apps/server/src/repositories/drizzle.ts`
- Modify: `apps/server/src/db/schema.ts`
- Modify: `packages/shared/src/schemas.ts`
- Test: `tests/server/api.test.mjs`

- [ ] **Step 1: Write failing server auth tests**

Add tests for missing auth, valid auth session ownership, and cross-user denial in `tests/server/api.test.mjs`.

- [ ] **Step 2: Run server tests and verify auth tests fail**

Run: `corepack pnpm test:server`

Expected: auth tests fail because protected routes are still public and no auth verifier exists.

- [ ] **Step 3: Implement auth verifier and route ownership checks**

Add configurable JWT verification, owner fields, and per-route ownership assertions.

- [ ] **Step 4: Run server tests and verify they pass**

Run: `corepack pnpm test:server`

Expected: server tests pass.

### Task 2: Web Auth Flow

**Files:**
- Create: `apps/web/src/features/auth/supabase.ts`
- Create: `apps/web/src/features/auth/useAuthSession.ts`
- Create: `apps/web/src/app/login/page.tsx`
- Modify: `apps/web/src/app/workbench/page.tsx`
- Modify: `apps/web/src/features/workbench/api.ts`
- Modify: `apps/web/src/app/globals.css`
- Modify: `apps/web/package.json`
- Test: `tests/web/workbench-page.test.mjs`

- [ ] **Step 1: Write failing web tests**

Add tests that check the login page exists and the API client can attach bearer tokens.

- [ ] **Step 2: Run web tests and verify they fail**

Run: `corepack pnpm test:web`

Expected: tests fail because auth files and token injection do not exist yet.

- [ ] **Step 3: Implement Supabase client, login page, auth gate, and token-aware API calls**

Add `@supabase/supabase-js`, implement auth helpers, login UI, workbench redirect, and API request token injection.

- [ ] **Step 4: Run web tests and typecheck**

Run: `corepack pnpm test:web`

Run: `corepack pnpm typecheck`

Expected: web tests and typecheck pass.

### Task 3: Environment And Docs

**Files:**
- Modify: `.env.example`
- Modify: `README.md`

- [ ] **Step 1: Document required Supabase variables**

Add `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_URL`, `SUPABASE_JWT_SECRET`, and `SUPABASE_JWT_AUDIENCE` to the example env and setup docs.

- [ ] **Step 2: Run full verification**

Run: `corepack pnpm test`

Run: `corepack pnpm typecheck`

Expected: all tests and typecheck pass.

