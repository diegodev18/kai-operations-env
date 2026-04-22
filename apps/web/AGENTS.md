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

All hooks in `apps/web/hooks/` must follow these conventions:

### 1. Structure

```
hooks/
├── index.ts              # barrel file with re-exports
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

### 2. Naming

- Hooks: `use-nombre.ts`
- Actions: `nombre.actions.ts`
- Directories: kebab-case

### 3. One hook per file

If related actions exist (async functions that mutate data), separate them into `.actions.ts` or add `// Actions` section at the end of the file.

### 4. Errors

- Pure hooks: return `error` or `null`, **do not use toast**
- Actions: use toast for user feedback

### 5. Barrel file

Create `index.ts` with re-exports of all public exports.

### 6. Avoid duplication

Extract shared logic into generic hooks (e.g., `useApiResource`).
