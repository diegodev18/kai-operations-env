# KAI Operations — guía para agentes

Este repositorio agrupa varias apps y herramientas.

- **Frontend Next.js** — convenciones detalladas (hooks, `components/`, `types/`, `services/`, exportaciones, megacomponentes, capas): **[`apps/web/AGENTS.md`](apps/web/AGENTS.md)**  
  Antes de tocar `apps/web/`, léelo; incluye reglas de Next, changelog, hooks (sin `toast` en hooks), componentes por dominio, barrels, y cuándo partir un megacomponente en subcarpeta.

- **API Bun + Hono** — capas `routes/` / `controllers/`, comandos, anti‑patrones de controladores monolíticos: **[`apps/api/AGENTS.md`](apps/api/AGENTS.md)**

## Resumen ejecutivo (web)

| Tema | Regla breve |
|------|-------------|
| Hooks `apps/web/hooks/` | Estado + `error`; **no** `toast` en hooks; feedback en acciones o UI. Barrel `@/hooks`. |
| `components/` | Por dominio (`agents/`, `prompt/`, …); **solo named exports** en componentes de producto. |
| `app/` | **`export default`** en páginas/layouts cuando Next lo exige. |
| Megacomponentes | Carpeta `dominio/feature/` con `index.tsx` + módulos por flujo (`types`, `constants`, `*-helpers`, vistas). |
| Tipos compartidos | Preferir `@/types` (barrel), no duplicar en hooks o en features salvo tipos realmente locales. |

## Resumen ejecutivo (api)

| Tema | Regla breve |
|------|-------------|
| `routes/` | Solo wiring Hono + auth; delegar en controllers. |
| `controllers/` | Handlers HTTP; si crece demasiado, carpeta + `index.ts` con reexports. |
| `export default` (routers) | Patrón actual en `routes/`; ver `apps/api/AGENTS.md` antes de cambiar. |
| Verificación | `bunx tsc -p apps/api/tsconfig.json --noEmit` en `apps/api/`. |

Otras carpetas en la raíz del monorepo pueden tener sus propias notas (`README`, `CLAUDE.md`, etc.); para código web y API usa los `AGENTS.md` de cada app.
