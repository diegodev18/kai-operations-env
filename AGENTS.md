# KAI Operations — guía para agentes

Este repositorio agrupa varias apps y herramientas. **Las convenciones de código del frontend Next.js** (hooks, `components/`, `types/`, `services/`, exportaciones, megacomponentes, capas `lib` / `consts` / `utils`) están documentadas en detalle aquí:

→ **[`apps/web/AGENTS.md`](apps/web/AGENTS.md)**

Antes de tocar `apps/web/`, léelo; incluye reglas de Next “no asumir la versión de training”, changelog, hooks (sin `toast` en hooks), componentes por dominio, barrels, y cuándo partir un megacomponente en subcarpeta.

## Resumen ejecutivo (web)

| Tema | Regla breve |
|------|-------------|
| Hooks `apps/web/hooks/` | Estado + `error`; **no** `toast` en hooks; feedback en acciones o UI. Barrel `@/hooks`. |
| `components/` | Por dominio (`agents/`, `prompt/`, …); **solo named exports** en componentes de producto. |
| `app/` | **`export default`** en páginas/layouts cuando Next lo exige. |
| Megacomponentes | Carpeta `dominio/feature/` con `index.tsx` + módulos por flujo (`types`, `constants`, `*-helpers`, vistas). |
| Tipos compartidos | Preferir `@/types` (barrel), no duplicar en hooks o en features salvo tipos realmente locales. |

Otras carpetas en la raíz del monorepo pueden tener sus propias notas (`README`, `CLAUDE.md`, etc.); no sustituyen a `apps/web/AGENTS.md` para el código de la app web.
