<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Web App (`apps/web`) — Agent Instructions

This is a Next.js frontend with its own specific structure. Import alias: **`@/*` → `apps/web/*`**.
The Next.js app rewrites `/api/*` to the backend.

## 📝 Changelog
Update `app/changelog/changelog-data.ts` only when releasing a new version, using SemVer (major.minor.patch). Do not update for every PR.

## 🪝 Hooks (`hooks/`)
- **Naming**: File names must be **kebab-case** and **NOT start with `use-`** (e.g., `hooks/agents/tools/agent-tools.ts` exports `useAgentTools`).
- **Feedback**: Hooks must return `error: string | null` where failures matter. **NEVER call `toast` inside a hook.**
- **Actions**: Async mutations and server actions go in sibling `*.actions.ts` files. `toast` calls belong here.
- **Barrels**: Export public hooks via `hooks/index.ts`. Consume via `import { ... } from "@/hooks"`.

## 🧩 Components (`components/`)
- **Exports**: Use **named exports only** (`export function MyComponent`) in product components. Reserve `export default` exclusively for `app/` directory (pages, layouts, route handlers).
- **Organization**: Group by domain (e.g., `components/agents/`, `components/operations/`). Do not repeat the domain name in the filename (e.g., `agents/form-builder.tsx`, not `agent-form-builder.tsx`).
- **Megacomponents**: If a component mixes concerns (e.g., a diagram + form + dialogs), split it into a subfolder `components/<domain>/<feature>/` with `index.tsx`, `types.ts`, `constants.ts`, and individual flow views (e.g., `diagram-dialogs.tsx`).
- **Shadcn UI**: Do not reorganize `components/ui/` or change the `ui` path alias.
- **Barrels**: Domains can have their own `index.ts` (e.g., `components/agents/index.ts`) to expose their public API.

## 🏗️ Application Layers
- **`services/`**: **HTTP clients only.** All `fetch` calls to the API live here. Re-export via domain files like `services/agents-api.ts`.
- **`lib/`**: App-local infrastructure (auth client, utility wrappers, `cn`). Do **NOT** put HTTP clients or fetch logic here. Group by domain folder, use kebab-case.
- **`utils/`**: Reusable pure helpers (parsing, formatting). No domain-specific HTTP.
- **`consts/`**: Product and domain constants (`as const` arrays). No server I/O.
- **`types/`**: Domain and API contract types. Re-export via `types/index.ts`. No HTTP clients, no large interfaces in hooks/lib. Do not duplicate types if they can be shared from the backend (`@kai/shared`).