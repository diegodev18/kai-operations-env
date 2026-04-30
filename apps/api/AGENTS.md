# API App (`apps/api`) — Agent Instructions

This is a **Bun + Hono** service using TypeScript (`strict`), Firebase Admin, Drizzle (PostgreSQL), and Better Auth.
Import alias: **`@/*` → `src/*`**.

## 🛠️ Commands
- **Dev Server**: `bun run dev` (runs `src/app.ts` in watch mode)
- **Drizzle DB**: `bun run db:generate`, `bun run db:migrate`, `bun run db:push`
- **Auth Schema**: `bun run db:auth-schema` (regenerates Better Auth schema)
- **Typecheck**: `bunx tsc -p apps/api/tsconfig.json --noEmit`

## 🏗️ Architecture & Layers

- **`routes/`**: Only for Hono routing, method definitions, and auth resolution (e.g., `resolveAgentsAuthContext`). Delegate all business logic to controllers.
  - **Registration Order**: In `routes/agents/index.ts` (and similar), register fixed routes BEFORE dynamic `/:id` parameters.
  - **Exporting**: Files should export a named router (e.g., `export const agentsRouter = new Hono()`). `routes/index.ts` combines them and exports `api`.
- **`controllers/`**: Only for HTTP handlers (taking `Context`, returning `Response`). Orchestrate validation, services, and Firestore here. Return errors using `ApiErrors` (`lib/api-error.ts`).
  - **Size Limit**: If a controller exceeds ~400 lines, split it into a `controllers/<domain>/` directory and move helper logic/Zod schemas to `utils/<domain>/`. Expose handlers via `controllers/<domain>/index.ts`.
- **`services/`**: Reusable multi-step jobs or flows (e.g., system prompt generation). Not for HTTP endpoints.
- **`lib/`**: App-wide infrastructure (Firestore client, auth, loggers, `ApiErrors`). Do not put domain-specific business logic here.
- **`utils/`**: Pure helpers, Zod validation schemas, Firestore serializers, and domain logic. Group by domain subfolders (e.g., `utils/agent-drafts/`).
- **`constants/`**: Fixed domain values and contracts.
- **`src/types/`**: Shared domain interfaces and DTOs. Export via barrel `src/types/index.ts`. Do not use `.d.ts` for business types. Types should never depend on `utils/` to avoid circular dependencies.
- **`db/`**: Drizzle PostgreSQL schema and client. Used for auth/sessions; Firestore is used for agent data.

## 📝 Naming Conventions
- **Files**: Use **kebab-case** for all `.ts` files in `lib/`, `utils/`, `constants/`, and `types/` (e.g., `session-user.ts`, not `sessionUser.ts`).
- **Environment**: Always read env vars from `src/config.ts`. Do not use `process.env` directly.