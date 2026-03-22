# kai-operations-env

To install dependencies:

```bash
bun install
```

Desarrollo (web + API):

```bash
bun install
bun run dev
```

La web usa rewrites a la API (`API_INTERNAL_URL`, ver `apps/web/.env.example`). Tras iniciar sesión, el dashboard lista agentes desde Firestore (`agent_configurations`) vía `GET /api/agents/info`.
