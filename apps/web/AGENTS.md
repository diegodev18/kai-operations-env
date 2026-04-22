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

All hooks in `apps/web/hooks/` deben seguir estas convenciones:

### 1. Estructura

```
hooks/
├── index.ts              # barrel file con re-exports
├── auth/
│   ├── auth.ts          # useAuth
│   └── use-user-role.ts # useUserRole
├── api/
│   └── use-api-resource.ts
├── agents/
│   ├── tools/
│   │   ├── use-agent-tools.ts
│   │   └── agent-tools.actions.ts
│   ├── properties/
│   │   ├── use-agent-properties.ts
│   │   └── use-testing-properties.ts
│   └── testing/
│       └── use-testing-diff.ts
└── chat/
    ├── use-prompt-chat.ts
    └── use-prompt-models.ts
```

### 2. Nombrado

- Hooks: `use-nombre.ts`
- Actions: `nombre.actions.ts`
- Directorios: kebab-case

### 3. Un hook por archivo

Si hay actions relacionadas (funciones async que mutan datos), separarlas en `.actions.ts` o poniendo `// Actions` al final del archivo.

### 4. Errores

- Hooks puros: retornar `error` o `null`, **no usar toast**
- Actions: usar toast para feedback al usuario

### 5. Barrel file

Crear `index.ts` con re-exports de todo lo público.

### 6. Evitar duplicación

Extraer lógica compartida a hooks genéricos (ej. `useApiResource`).
