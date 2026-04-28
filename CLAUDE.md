# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Monorepo Overview

Bun-based monorepo with three workspaces:
- **`apps/api`** — Bun + Hono backend (port 3001)
- **`apps/web`** — Next.js 16 + React 19 frontend (port 3000)
- **`packages/shared`** — Shared TypeScript types exported as `@kai/shared`

## Commands

### Root (run from repo root)
```bash
bun run dev          # Start both web and API in watch mode
bun run build        # Build web + api
bun run build:shared # Build shared package only
```

### API (`apps/api`)
```bash
bun run dev          # Watch mode (src/app.ts)
bun run db:push      # Apply Drizzle migrations to PostgreSQL
bun run db:generate  # Generate migration files
bun run db:migrate   # Run migrations
bun run db:auth-schema # Regenerate Better Auth schema
bun run seed         # Run scripts/seed.ts
```

### Web (`apps/web`)
```bash
bun run dev          # Next.js dev server
bun run lint         # ESLint
bun run test:e2e:auth      # Generate Playwright auth session (e2e/auth.json)
bun run test:e2e:form      # Run E2E smoke tests
bun run test:e2e:form:step # E2E with step-by-step pause
```

E2E tests require `e2e/auth.json` (run `test:e2e:auth` first) and env vars: `FORM_BUILDER_BASE_URL`, `E2E_TEST_EMAIL`, `E2E_TEST_PASSWORD`.

## API Architecture (`apps/api/src/`)

Layered architecture — each layer has a strict responsibility:

| Layer | Path | Responsibility |
|---|---|---|
| Routes | `routes/` | Register HTTP endpoints, check auth, delegate to controllers |
| Controllers | `controllers/` | Parse request, validate, orchestrate utils/Firestore, return response |
| Services | `services/` | Reusable multi-step jobs (system prompt generation, lifecycle sync) |
| Utils | `utils/` | Domain helpers, Zod schemas, serialization (organized by subdomain) |
| Lib | `lib/` | Infrastructure only: auth client, Firestore client, error handling, logging |
| Constants | `constants/` | Domain contracts and property definitions |
| Types | `types/` | TypeScript interfaces — one domain per file, barrel-exported from `types/index.ts` |
| DB | `db/` | Drizzle client + PostgreSQL schemas (incl. Better Auth schema) |

**Route registration order matters:** fixed routes must come before `/:agentId` params in `routes/agents/index.ts`.

**Controller size limit:** if a controller exceeds ~400–500 LOC or mixes concerns, split into `controllers/<domain>/` subdirectory and move logic to `utils/<domain>/`.

Key infrastructure:
- `lib/api-error.ts` — Unified `ApiErrors` class with structured error codes
- `lib/firestore.ts` — Centralized Firestore client (REST transport preferred in Bun via `FIRESTORE_PREFER_REST`)
- `src/config.ts` — All env var access (never read `process.env` directly elsewhere)

## Web Architecture (`apps/web/`)

### Directory Conventions

**`services/`** — HTTP clients only. All calls to the backend API live here. Never put fetch calls in `lib/` or hooks.

**`lib/`** — App-local infrastructure (auth client, utility wrappers). No HTTP business logic.

**`hooks/`** — Custom React hooks organized by domain subdirectory. Filename convention: kebab-case without `use-` prefix (e.g., `hooks/agents/agent-tools.ts` exports `useAgentTools`). Hooks return `error: string | null` — no `toast` calls inside hooks; UI feedback belongs in action handlers or components.

**`components/`** — Product UI organized by domain folder (`agents/`, `operations/`, `prompt/`, `blog/`, `database/`, `shared/`). Use **named exports only** (no `export default` except in `app/` pages/layouts required by Next.js). The `ui/` subfolder is managed by shadcn CLI — don't reorganize it.

**Megacomponents** (complex features with multiple concerns): split into `components/<domain>/<feature>/` subfolder containing `index.tsx`, `types.ts`, `constants.ts`, helper files, and individual component files.

**`types/`** — API contract types and domain interfaces. Prefer `import { … } from "@/types"` via the barrel.

**`consts/`** — Static product constants. No fetch or server I/O.

### Import alias
`@/*` maps to the `apps/web` root. The Next.js app rewrites `/api/*` to the backend via `NEXT_PUBLIC_API_URL` (default: `http://localhost:3001`).

## Shared Package (`packages/shared`)

Exports two entry points:
- `@kai/shared` — TypeScript types, error/response contracts
- `@kai/shared/zod` — Zod schemas (builder, tools, drafts, billing)

Must rebuild (`bun run build:shared`) after changes before the apps pick up updates.

## Environment Variables

**API** (see `apps/api/.env.example`):
- `DATABASE_URL` — PostgreSQL connection string
- `BETTER_AUTH_SECRET` — Session secret (min 32 chars in prod)
- `BETTER_AUTH_URL` / `WEB_ORIGIN` — Auth cookie origin + CORS
- `FIREBASE_APP_NAME` + `FIREBASE_SERVICE_ACCOUNT_JSON` — Firebase Admin SDK
- `GEMINI_API_KEY` or `VERTEX_AI_PROJECT`/`VERTEX_AI_LOCATION`/`GOOGLE_APPLICATION_CREDENTIALS`

**Web** (see `apps/web/.env.example`):
- `NEXT_PUBLIC_APP_URL` — Public URL of the web app
- `NEXT_PUBLIC_API_URL` — Internal URL of the API (used for Next.js rewrites)

## Key Architectural Rules

1. **No circular imports** — if logic is needed across controllers, extract to `utils/` or `services/`.
2. **`lib/` vs `services/`** — `lib/` is for SDKs and infrastructure only; HTTP calls to the backend go in `services/`.
3. **Strict TypeScript** — all packages use `strict: true`; no `any` escapes without justification.
4. **Zod validation at boundaries** — validate incoming request payloads in controllers using schemas from `utils/` or `constants/`.
5. **Firestore is primary data store for agent data** — PostgreSQL (Drizzle) handles auth/sessions and relational data only.

## Detailed Conventions

For in-depth coding conventions for each layer, see:
- `apps/api/AGENTS.md` — API layer rules, naming, anti-patterns
- `apps/web/AGENTS.md` — Component, hook, service, type, and barrel conventions
