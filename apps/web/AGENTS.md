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
    ├── prompt-chat.ts          # usePromptChat (+ re-exports from @/types/prompt-chat)
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

- Domain types stay under `apps/web/types/` (e.g. `@/types/prompt-chat`). Hooks may re-export types for convenience when they already did so historically; do not duplicate type definitions inside hook files.
