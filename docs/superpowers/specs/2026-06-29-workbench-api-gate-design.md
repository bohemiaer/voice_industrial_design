# Workbench API Gate Design

Date: 2026-06-29

## Goal

When a user enters `/workbench`, show a mandatory API configuration modal if no SiliconFlow API key exists in local browser storage. The workbench UI may render underneath, but all interaction must remain blocked until the key is saved.

## User Experience

1. User opens `/workbench`.
2. The page checks `localStorage` for a saved API key.
3. If a key is missing:
   - Show a full-screen overlay modal.
   - Keep the workbench visible underneath.
   - Block all clicks, typing, recording, and canvas interaction.
   - Do not allow dismissing the modal without saving.
4. The modal contains:
   - Title: `请填写 API`
   - Helper copy: `硅基流动注册即可获得免费额度 API；配置后即可使用！`
   - Link to `https://cloud.siliconflow.cn/i/pUZUB64c`
   - One input field labeled `API`
   - One primary action: `保存并开始使用`
5. After save:
   - Persist the value to `localStorage`
   - Hide the modal
   - Allow workbench interaction
   - Start the existing API session initialization flow
6. On later visits in the same browser:
   - Skip the modal when the API key already exists locally

## Visual Design

- Match the workbench visual language:
  - pale neutral background
  - soft border
  - medium radius
  - subtle shadow
  - dark text and restrained accent styling
- Use a foggy/light overlay instead of a heavy black mask.
- Keep the modal visually consistent with the right-side conversation/input surfaces.

## Architecture

### New UI responsibility

Add a client-side gate in the workbench page layer that decides whether the app is:

- `locked`: API key missing, show modal and block interaction
- `ready`: API key present, initialize and use the workbench normally

### Storage

- Store the key only in browser `localStorage`
- Recommended storage key: a dedicated workbench-specific constant
- No server persistence in this change

### Initialization flow

- Today, `/workbench` calls `initializeApiSession()` on mount.
- After this change:
  - mount -> check local key
  - if key exists -> initialize session immediately
  - if key missing -> wait for modal save, then initialize session

### API integration boundary

- The saved key should become available to the frontend API layer through a small access-token/API-key provider boundary rather than hard-coding reads in multiple places.
- The implementation should stay localized to the workbench page + API client boundary.

## Components

### New modal component

Create a focused modal component responsible for:

- rendering the copy/link/input/button
- validating non-empty input
- surfacing a save action

It should not know about session creation details.

### Workbench page orchestration

`apps/web/src/app/workbench/page.tsx` should:

- own the gate state
- read/write local storage
- decide when to render the modal
- decide when to call `initializeApiSession()`

## Validation Rules

- Empty API input cannot be submitted.
- Leading/trailing spaces should be trimmed before saving.
- Modal remains open if the value is empty after trimming.

## Error Handling

- If local storage read/write fails, keep the modal open and show a short inline error.
- If API session initialization fails after save, preserve the saved key and let the existing workbench error state handle backend/API failures.

## Testing

1. No saved key:
   - `/workbench` shows modal
   - workbench beneath is blocked
   - session initialization does not run before save
2. Save valid key:
   - modal closes
   - key is stored
   - session initialization starts
3. Saved key exists:
   - modal does not appear
   - page initializes normally
4. Empty submit:
   - modal stays open
   - inline validation appears

## Scope Notes

- This change does not add account-level encrypted storage.
- This change does not add API key editing/removal entry points elsewhere in the UI.
- This change does not redesign the existing workbench layout outside the new overlay/modal.
