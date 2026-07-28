# My Inner Pages — Frontend

React 18 SPA with TypeScript, Vite, Tailwind CSS, TanStack Query, Playwright.

## Commands (run from `frontend/`)
- `npm install` — install dependencies
- `npm run dev` — Vite dev server (port 5173, HMR)
- `npm run build` — type-check + production build
- `npm test` — Vitest unit & component tests (fast in-memory execution)
- `npm run test:e2e` — Playwright E2E tests (parallel multi-worker browser tests, uses system Chrome)
- `npm run lint` — ESLint (zero warnings policy)

## Non-obvious tooling
- Path aliases: import via `@/`, `@components/`, `@hooks/`, etc.
- No routing library — single-page app with conditional rendering on `activeView`. Implemented a custom `useRouter` hook that synchronizes navigation state with URL query parameters and HTML5 history events (`popstate`) to enable browser/mobile back-button navigation and reload preservation.
- Zod v4 for API response validation (in `utils/api.ts`)
- ChatView always mounted (CSS `hidden` class) — preserves chat state across view switches

## Architecture
- **Feature-based components:** `auth/`, `journal/`, `chat/`, `mirror/`, `settings/`, `admin/`, `landing/`, `layout/`, `common/`
- **No router:** `App.tsx` renders the active view (values: `journal`, `mirror`, `chat`, `settings`, `admin`) based on query parameters parsed by the `useRouter` hook, making the URL the single source of truth.
- **State:** AuthContext (global auth), ThemeContext (preferences), TanStack React Query (server data), local state for ephemeral UI, useRouter (navigation)
- **SSE chat streaming:** `useChatStream` hook manages streaming state via `fetch()` + `ReadableStream`, with `AbortController` for cancellation. ConnectionState (`connected` | `disconnected` | `failed`) reflects whether a chat is loaded and ready. ChatView is always mounted (CSS `hidden`) to preserve state across view switches.
- **Offline/Sync:** Keystrokes are instantly persisted locally to IndexedDB via Yjs + `y-indexeddb` per journal entry, making the local document the source of truth. Unsynced changes (including offline-created drafts starting with `draft-`) are written to `localStorage` and synced to the backend in the background via `useBackgroundSync` hook (online/focus listeners, 30s interval) which calls `syncService.syncUnsyncedEntries()` to map draft IDs to MongoDB ObjectIds.
- **Barrel exports:** each component directory has `index.ts`

## Error monitoring (Sentry)
- DSN configured via `VITE_SENTRY_DSN` env var (optional — if empty, Sentry is a no-op)
- Initialized in `main.tsx` with `browserTracingIntegration` and `replayIntegration`
- `Sentry.ErrorBoundary` wraps the app root with a fallback UI and automatic error reporting
- `useBackendHealth` hook in `src/hooks/useBackendHealth.ts` — polls `/health` every 60s with exponential backoff, reports healthy→unhealthy/critical transitions to Sentry
- `src/utils/api.ts` enhanced with Sentry event capture on:
  - **Network errors** (`TypeError: Failed to fetch`) — tagged as `error_type: network` with full context
  - **5xx responses** — tagged with endpoint, status code, method
  - **3+ consecutive failures** — triggers a `backend_unreachable` event
  - **Slow responses** (>5s) — breadcrumb added
- SSE stream errors are captured in `useChatStream`
- All events tagged with `endpoint`, `status_code`, `consecutive_failures`, `is_authenticated`

## UX principles
- **Mobile-first:** design for phone screens first, then enhance for desktop

## Key conventions
- **Imports:** path aliases over relative; external first, local second
- **Components:** arrow functions, destructured inline props
- **CSS:** Tailwind utility classes only — no CSS modules or styled-components
- **Types:** TypeScript interfaces for models, type aliases for unions, Zod schemas for API

## Testing strategy
- **Unit & Component Testing (Vitest):** Run with `npm test`. Uses `@testing-library/react` + `jsdom`. Vitest tests run fast in-memory without browser startup overhead and should be preferred for validating component rendering, custom hooks, utilities, and isolated state logic.
- **E2E Integration Testing (Playwright):** Run with `npm run test:e2e`. Uses system Chrome (`channel: 'chrome'`) with parallel workers (`fullyParallel: true`). Use Playwright for validating end-to-end user journeys, authentication flows, cross-page persistence, and full system regressions.
- **E2E conventions:** No test IDs — select via user-visible text, aria-labels, or semantic roles. Auth helpers available in `e2e/fixtures.ts` (`createUser()`, `loginAsUser()`). Always seed auth cookies in context before `page.goto('/')` to avoid double page reloads.

## Adding a new environment variable

To add a new `VITE_*` env var, update these 3 places:

1. **`frontend/.env.example`** — document the default
2. **`frontend/Dockerfile`** — add `ARG` + `ENV` line (with a sensible default so local Docker builds still work)
3. **`.github/workflows/deploy-vps.yml`** — add to the `env:` block and as a `--build-arg` in the `docker build` command. If the value is sensitive, reference a GitHub secret.

## Boundaries
- Do NOT add react-router — conditional rendering pattern is intentional
- Do NOT use test IDs in E2E tests — use user-visible selectors
- Do NOT use relative imports like `../../` when `@components/` alias exists

## Reference docs
- `README.md` — setup guide, features overview, user flow, configuration
- `docs/features/` — feature-specific docs (tag system, local-first editor, SSE chat streaming)
- `docs/adr/` — architecture decision records
