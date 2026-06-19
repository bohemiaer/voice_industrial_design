# Supabase Auth Design

## Goal

Add account-based access to the voice workbench with Supabase Auth while keeping the existing Next.js web app and Fastify API boundaries intact.

The first implementation supports email registration and login, protects the workbench flow, and stores newly created brainstorm sessions under the authenticated Supabase user. The design keeps the backend auth model compatible with later OAuth providers such as Google or GitHub.

## Product Scope

- The home page stays public.
- Starting or entering the workbench requires login.
- New sessions created after this change belong to the authenticated user.
- Existing anonymous sessions are not migrated.
- Email/password auth ships first.
- OAuth providers can be added later from Supabase without changing the backend ownership model.

Out of scope for the first pass:

- Migrating anonymous trial data after login.
- User profile editing.
- Organization or team accounts.
- Admin dashboards.
- Custom first-party auth tokens.

## Architecture

The web app owns the login experience. It uses `@supabase/supabase-js` to register, sign in, sign out, and read the current session. API calls include the Supabase access token in an `Authorization: Bearer <token>` header.

The Fastify server does not perform login. It validates Supabase JWTs for protected API routes, extracts the authenticated user id from the `sub` claim, and uses that id as the business `ownerUserId`.

```text
Browser
  -> Supabase Auth: sign up / sign in
  -> Fastify API: Authorization: Bearer <Supabase access token>
Fastify API
  -> validates JWT
  -> maps token.sub to ownerUserId
  -> reads/writes sessions owned by ownerUserId
```

## Configuration

Web environment variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Server environment variables:

- `SUPABASE_URL`
- `SUPABASE_JWT_SECRET`
- `SUPABASE_JWT_AUDIENCE`, default `authenticated`

The backend validates JWTs locally with the Supabase JWT secret. This keeps API request latency low and avoids a network call to Supabase on every request.

## Data Model

Add `ownerUserId` to the shared `Session` model and to the server session repository create input.

For PostgreSQL persistence, add `owner_user_id text not null` to `sessions`.

For memory persistence, store `ownerUserId` directly on the in-memory `Session` object.

Tree nodes, messages, generation tasks, branch tasks, and tree operations remain session-scoped. Ownership checks happen by first loading the parent session and verifying that `session.ownerUserId === currentUser.userId`.

## API Rules

Public routes:

- `GET /health`

Protected routes:

- `POST /api/transcriptions`
- `POST /api/sessions`
- `GET /api/sessions/:sessionId/tree`
- `GET /api/sessions/:sessionId/messages`
- `POST /api/sessions/:sessionId/voice-turns`
- `POST /api/sessions/:sessionId/undo`
- `POST /api/sessions/:sessionId/redo`
- `GET /api/tasks/:taskId`
- `POST /api/tasks/:taskId/confirm`
- `POST /api/tasks/:taskId/cancel`

Protected route behavior:

- Missing token returns `401 AUTH_REQUIRED`.
- Invalid or expired token returns `401 AUTH_INVALID`.
- Accessing another user's session or task returns `404 SESSION_NOT_FOUND` or `404 TASK_NOT_FOUND`, matching the existing resource-not-found style and avoiding cross-user existence leaks.
- Creating a session requires auth and writes `ownerUserId` from the token `sub` claim.

## Web Flow

Add an auth module in `apps/web`:

- Supabase browser client factory.
- Auth state hook or provider for the current session and loading state.
- Helper for getting the current access token for API requests.

Add `/login`:

- Email/password sign in.
- Email/password registration.
- Redirects to `next` query param after success, defaulting to `/workbench`.
- Shows actionable errors from Supabase without exposing raw internal details.

Update `/workbench`:

- On load, check auth state before initializing the workbench API session.
- If unauthenticated, redirect to `/login?next=/workbench`.
- If authenticated, continue the existing workbench initialization.

Update the workbench API client:

- Attach `Authorization` to JSON and form requests.
- Surface `401` as an auth-required state so the page can redirect cleanly.

## Testing

Server tests:

- Protected routes reject missing tokens.
- Protected routes reject invalid tokens.
- A valid token can create a session, and the returned session includes the token user id as `ownerUserId`.
- User A cannot read User B's session tree, messages, or mutate it through voice turns, undo, or redo.
- Task lookup validates ownership through the task session.

Web tests:

- The login page renders sign-in and registration controls.
- The workbench page waits for auth before creating an API session.
- The API client includes the bearer token for JSON requests.
- The API client includes the bearer token for multipart requests.

## Implementation Notes

Use dependency injection for server JWT verification in tests so API tests can create deterministic valid and invalid auth contexts without relying on real Supabase credentials.

Keep auth helper functions small and explicit:

- `authenticateRequest(request)`
- `requireAuth(request)`
- `assertSessionOwner(session, currentUser)`

This keeps route handlers readable and makes it easier to add OAuth providers later without changing business routes.

