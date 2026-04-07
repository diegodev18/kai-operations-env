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
