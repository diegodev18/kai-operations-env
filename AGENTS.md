# KAI Operations — Agent Instructions

This repository is a Bun-based monorepo with three workspaces: `apps/web` (Next.js), `apps/api` (Hono/Bun), and `packages/shared`. 

## 🏗️ Monorepo & Build Quirks
- **Shared Package (`@kai/shared`)**: If you modify `packages/shared/`, you MUST run `bun run build:shared` from the root before the web or api apps will pick up your changes.
- **Run Dev**: `bun run dev` at the root starts both apps. Web runs on 3000, API on 3001. Next.js rewrites `/api/*` to the backend.

## 🕸️ Web (`apps/web`)
- **HTTP/Fetch rules**: ALL calls to the backend API live in `services/`. NEVER put fetch calls in `lib/` or `hooks/`.
- **`lib/`**: Used for app-local infra (auth wrappers, utility functions), not business logic.
- **Hooks (`hooks/`)**: Custom hooks must return `error: string | null`. **Never call `toast` inside a hook.** Feedback belongs in action handlers or UI components.
- **Components (`components/`)**:
  - Use **named exports only** (no `export default` except for `app/` pages/layouts).
  - Megacomponents (complex features) go in `components/<domain>/<feature>/` with their own `index.tsx`, `types.ts`, and views.
  - Do not reorganize `components/ui/` (managed by shadcn).

## 🔌 API (`apps/api`)
- **Layer Strictness**: 
  - `routes/`: Only Hono wiring and auth checks. Delegate everything else to controllers.
  - `controllers/`: HTTP handlers. If a controller exceeds ~400 LOC, split it into a `controllers/<domain>/` directory and move helper logic to `utils/<domain>/`.
- **Route Registration Order**: In `routes/agents/index.ts`, fixed routes must be registered BEFORE dynamic `/:agentId` params.
- **Data Stores**: Firestore is the primary store for agent data. PostgreSQL (via Drizzle) handles Better Auth sessions and specific relational data.
- **Config**: Always use `src/config.ts` for environment variables. Do not read `process.env` directly elsewhere.

## 🛠️ Key Commands
Run these from the relevant app directory or use `--filter`:
- **API DB**: `bun run db:push` (Postgres migrations), `bun run db:auth-schema` (Better Auth schema generation).
- **Web E2E**: Playwright tests require `bun run test:e2e:auth` before running `bun run test:e2e:form`.

## 📚 Further Reading
Check the app-specific rule files before heavily modifying either app:
- [`apps/web/AGENTS.md`](apps/web/AGENTS.md)
- [`apps/api/AGENTS.md`](apps/api/AGENTS.md)