<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Changelog

When making changes that warrant a changelog entry, update `app/changelog/changelog-data.ts`.

### Adding a new version

1. Add a new entry to `changelogData` with the version number as key:
```typescript
"2.1.0": {
  date: "YYYY-MM-DD",
  description: "Brief description of the release",
  changes: {
    added: ["New feature 1", "New feature 2"],
    changed: ["Improved something"],
    fixed: ["Bug fix"],
    improved: ["Optimization"],
    removed: ["Deprecated feature"],
  },
},
```

2. The version number follows semver (major.minor.patch).

3. Only add entries when releasing a new version - do not update the changelog for every PR.

## Hooks

All hooks in `apps/web/hooks/` follow these conventions. Prefer importing from the barrel `@/hooks` unless you need a deep import for a specific reason.

### 1. Structure

```
hooks/
├── index.ts                    # barrel: re-export public hooks + actions
├── auth/
│   ├── auth.ts                 # useAuth
│   └── user-role.ts            # useUserRole
├── api/
│   └── api-resource.ts         # useApiResource
├── agents/
│   ├── tools/
│   │   ├── agent-tools.ts      # useAgentTools
│   │   ├── agent-tools.actions.ts
│   │   └── tools-catalog.ts    # useToolsCatalog
│   ├── properties/
│   │   ├── agent-properties.ts        # useAgentProperties
│   │   ├── testing-properties.ts      # useTestingProperties
│   │   ├── agent-properties.actions.ts
│   │   └── properties-base.ts         # shared state helpers (internal)
│   ├── prompt/
│   │   ├── production-prompt.ts       # useProductionPrompt, fetchProductionPromptSnapshot
│   │   └── agent-prompt.actions.ts      # updateAgentPrompt, promotePromptToProduction
│   └── testing/
│       └── testing-diff.ts     # useTestingDiff
└── chat/
    ├── prompt-chat.ts          # usePromptChat (+ re-exports from @/types)
    └── prompt-models.ts        # usePromptModels
```

### 2. Naming

- **Files and directories:** kebab-case where applicable; **file names must not start with `use-`**.
- **Hook functions:** export names use the `use` prefix (e.g. `useAuth` in `auth/auth.ts`, `useAgentTools` in `agents/tools/agent-tools.ts`).
- **Actions:** `nombre.actions.ts` (async mutations, API calls with user-facing feedback).

### 3. One hook per file

- One primary hook per module when possible.
- Related async mutations belong in a sibling `*.actions.ts` file (or a clearly marked `// Actions` block only if splitting would be artificial).

### 4. Errors and feedback

- **Hooks:** return structured state including `error: string | null` where failures matter; **do not use `toast`** inside hooks.
- **Actions:** use `toast` (or equivalent) for success/error feedback after mutations.

### 5. Barrel file (`index.ts`)

- Re-export everything that is part of the public API of `hooks/` from `hooks/index.ts`.
- Consumers should prefer `import { … } from "@/hooks"`.

### 6. Avoid duplication

- Extract shared fetch/state patterns into small primitives (e.g. `useApiResource` in `api/api-resource.ts`) or internal helpers (e.g. `properties-base.ts`), instead of copying the same `useEffect` / `useState` blocks across hooks.

### 7. Types

- Domain types stay under `apps/web/types/` (e.g. `@/types`). Hooks may re-export types for convenience when they already did so historically; do not duplicate type definitions inside hook files.

## Components (`apps/web/components/`)

- UI de producto agrupada por **dominio** en subcarpetas; **no** hay barrel global `@/components` (solo por dominio, ver abajo).
- **[`components/ui/`](apps/web/components/ui/)** y alias shadcn en [`components.json`](components.json): no mover `ui/` ni cambiar el alias `ui` → `@/components/ui` sin actualizar shadcn.
- **[`components/ai-elements/`](apps/web/components/ai-elements/)**: piezas de registro externo (p. ej. shimmer); tratarlas como capa aparte de `ui/`.

### Nombres de archivo dentro del dominio

Dentro de una carpeta de dominio, el nombre del archivo **no repite** el prefijo que ya da la carpeta (ej. `agents/form-builder.tsx` exportando `AgentFormBuilder`, no `agents/agent-form-builder.tsx`). Igual: `operations/dashboard.tsx`, `prompt/chat-panel.tsx`.

### Barrels opcionales por dominio

- [`components/agents/index.ts`](apps/web/components/agents/index.ts), [`operations/index.ts`](apps/web/components/operations/index.ts), [`prompt/index.ts`](apps/web/components/prompt/index.ts), [`shared/index.ts`](apps/web/components/shared/index.ts), [`blog/index.ts`](apps/web/components/blog/index.ts): re-exportan la API pública de ese dominio. Preferir `import { … } from "@/components/agents"` cuando importes varios símbolos del mismo dominio; usar ruta profunda (`@/components/agents/form-builder`) si quieres acotar el grafo de módulos.

### Árbol orientativo

```
components/
├── ui/                    # shadcn / Radix (no mover)
├── ai-elements/
├── agents/                # constructor, diagrama, configuración, herramientas, simulador, secciones…
├── operations/            # dashboard, shell (breadcrumb)
├── prompt/                # chat panel, markdown editor, diff, promote diff
├── blog/                  # compositor actualidad (markdown-composer)
├── database/              # JsonTreeView + utils
└── shared/                # login, user menu, diálogos transversales, form-input-components, changelog-nav…
```

## App layers (`types`, `consts`, `utils`, `lib`, `services`)

Use the right folder so HTTP clients, constants, and shared helpers do not drift into `lib/`.

### 1. `types/` ([`apps/web/types/`](apps/web/types))

- All domain and API contract types (even if only one module uses them today). Prefer **`import type { … } from "@/types"`** (barrel [`types/index.ts`](types/index.ts)). Imports profundos (`@/types/agents/agents-api`, etc.) solo si necesitas evitar el barrel.
- `lib/`, `services/`, `hooks/`, and components should not grow large `interface` / `type` blocks; keep shapes here.
- Literales del editor de schema (`SCHEMA_TYPES`, `EMPTY_SCHEMA`, `SchemaType`) viven en [`consts/parameter-schema.ts`](consts/parameter-schema.ts) y se reexportan desde `@/types` por comodidad.

```
types/
├── index.ts                         # barrel público → preferir `from "@/types"`
├── agents/
│   ├── agents-api.ts                # payloads / respuestas del cliente HTTP de agentes
│   ├── agent-tool.ts
│   └── agent-properties.ts
├── form-builder/
│   └── index.ts                     # estado y tipos del constructor de agentes
├── chat/
│   ├── prompt-chat.ts               # asistente de diseño de prompt
│   └── prompt-diff.ts
├── integration/
│   └── integration-simulator.ts
└── parameter-schema/
    └── editor.ts                    # EditorProperty / EditorState (SchemaType desde consts)
```

### 2. `consts/` ([`apps/web/consts/`](apps/web/consts))

- Product and domain constants (`as const` arrays, fixed lists, default IDs). Examples: [`consts/blog-tags.ts`](consts/blog-tags.ts), [`consts/form-builder/`](consts/form-builder/) (constructor de agentes), [`consts/parameter-schema.ts`](consts/parameter-schema.ts) (listas del editor de schema de herramientas).
- No `fetch` or server I/O.

### 3. `utils/` ([`apps/web/utils/`](apps/web/utils))

- Reusable helpers (parsing, formatting, generic API helpers like [`utils/api-helpers`](utils/api-helpers)). No agent-specific HTTP here unless it is a tiny shared primitive used across services.

### 4. `lib/` ([`apps/web/lib/`](apps/web/lib))

- App-local “infra” (no `fetch` a APIs de negocio): auth client, `cn`, mapeos de dominio, lógica del builder que no sea solo datos, etc.
- **Estructura por carpetas** (mismo criterio que `apps/web/hooks/`): dominio en kebab-case, **un módulo por archivo** cuando sea razonable, barrel [`lib/index.ts`](lib/index.ts) con re-exports públicos; preferir `import { … } from "@/lib"` o rutas explícitas `import { cn } from "@/lib/utils"`.

```
lib/
├── index.ts                 # barrel público (re-export)
├── auth/
│   └── auth-client.ts
├── utils/
│   ├── index.ts             # export { cn } from "./cn"
│   └── cn.ts
├── agents/
│   └── agent.ts             # tipos/mappers Agent (no HTTP)
├── form-builder/
│   └── builder-technical-properties.ts
├── blog/
│   └── lesson-markdown.ts
├── profile/
│   └── github-avatar.ts
└── phone/
    └── whatsapp-phone-format.ts
```

- Do **not** add new `*-api.ts` HTTP clients under `lib/`; use `services/` instead.
- Do **not** use `lib/` como lugar por defecto para constantes globales desacopladas (usa `consts/`) ni helpers genéricos (usa `utils/`).

### 5. `services/` ([`apps/web/services/`](apps/web/services))

- HTTP clients only: `fetch` to `/api/...`, response handling, and module-local helpers that exist only to support those calls.
- Prefer importing from the public entry when one exists, e.g. `import { fetchAgentById, AGENTS_BASE } from "@/services/agents-api"` (implemented under [`services/agents/`](services/agents) and re-exported from [`services/agents-api.ts`](services/agents-api.ts)).

### 6. Imports (examples)

```ts
import type { AgentBuilderFormResponse } from "@/types";
import { AgentFormBuilder } from "@/components/agents";
import { LoginPage } from "@/components/shared";
import { BLOG_TAGS } from "@/consts/blog-tags";
import { parseJsonResponse } from "@/utils/api-helpers";
import { cn } from "@/lib/utils";
// o: import { cn, authClient } from "@/lib";
import { fetchAgentsPage } from "@/services/agents-api";
```
