# API (`apps/api`) — guía para agentes

Servicio **Bun + Hono** con TypeScript (`strict`), Firebase Admin, Drizzle (Postgres) y Better Auth. El alias de imports es **`@/*` → `src/*`** ([`tsconfig.json`](tsconfig.json)).

## Arranque y comandos

| Comando | Uso |
|---------|-----|
| `bun run dev` | Servidor con watch (`src/app.ts`) |
| `bun run start` | Producción local sin watch |
| `bun run db:generate` / `db:migrate` / `db:push` | Drizzle ([`drizzle.config.ts`](drizzle.config.ts)) |
| `bun run db:auth-schema` | Regenerar esquema Better Auth en `src/db/schema/auth.ts` |
| `bun run seed` | `scripts/seed.ts` |

Verificación rápida: `GET /` y `GET /health` en el puerto configurado ([`config.ts`](src/config.ts)); bajo el prefijo montado, `GET /api/health` según [`app.ts`](src/app.ts).

## Entrada HTTP

[`src/app.ts`](src/app.ts): instancia Hono raíz, CORS, ruta Better Auth `/api/auth/*`, y **`app.route("/api", api)`** donde `api` es el router compuesto exportado desde [`src/routes/index.ts`](src/routes/index.ts).

## Capas (qué va dónde)

| Carpeta | Rol | Evitar |
|---------|-----|--------|
| **`routes/`** | Definición de rutas Hono: método, path, orden. Resolver auth con helpers (p. ej. [`agents-auth.ts`](src/routes/agents-auth.ts)) y delegar al **controller**. | Lógica de negocio larga, acceso directo masivo a Firestore sin pasar por un controlador/servicio claro. |
| **`controllers/`** | Solo **handlers de rutas** (funciones que reciben `Context` y devuelven `Response`): validar input, permisos, orquestar Firestore/servicios, `ApiErrors` / [`lib/api-error.ts`](src/lib/api-error.ts). La lógica auxiliar vive en **`utils/`** (o `services/`). | Helpers de dominio dentro de `controllers/`; monolitos de miles de líneas (ver más abajo). |
| **`services/`** | Jobs o flujos reutilizables (p. ej. generación de system prompt, sync). | Endpoints HTTP; eso es `routes` + `controllers`. |
| **`lib/`** | Infra transversal: auth, Firestore client, logger, errores API. | Clientes HTTP a APIs externas de producto si merecen otro sitio; criterio: si es solo para un dominio, valorar `services/`. |
| **`utils/`** | Helpers puros o compartidos (validación Zod, errores Firestore, serialización, authz de lectura Firestore). Agrupar por dominio en subcarpetas (p. ej. [`utils/agent-drafts/`](src/utils/agent-drafts/) para borradores). | Duplicar tipos que deberían vivir en `types/`. |
| **`constants/`** | Contratos y valores fijos del dominio (propiedades builder, defaults Firestore, etc.). | Lógica condicional pesada (mejor `utils/` o `services/`). |
| **`db/`** | Cliente Drizzle y esquemas SQL. | Reglas de negocio de agentes. |
| **`src/types/`** | Declaraciones `.d.ts` compartidas en la API. | — |

Flujo típico: `routes/*.route.ts` → función en `controllers/*.controller.ts` → `services/` / `lib/firestore` / `utils/`.

## `routes/` vs `controllers/`

- **Ruta:** registra `agentsRouter.get/post/...`, llama a `resolveAgentsAuthContext(c)` (o equivalente) y pasa `Context` + contexto de auth al handler.
- **Controller:** función `export async function nombreHandler(c: Context, authCtx: …)` que asume auth ya resuelta; centraliza errores con `ApiErrors` / `errorResponse`.

Añadir un endpoint nuevo: casi siempre un método nuevo en el router correspondiente **más** una función exportada en el controlador del dominio (o un controlador nuevo si el dominio no existe).

## Exportaciones (routers con nombre)

Los archivos en **`routes/`** exportan el router Hono con **nombre** (`export const blogRouter`, `export const agentsRouter`, etc.). El agregador [`routes/index.ts`](src/routes/index.ts) exporta **`export const api`** y compone las rutas con imports nombrados. [`app.ts`](src/app.ts) usa `import { api } from "@/routes"`.

Al añadir un router nuevo: `export const miRouter = new Hono();` … y en `index.ts` importar `{ miRouter }` y registrar `api.route("/mi-prefix", miRouter)`.

## Controladores grandes (anti‑patrón y remedio)

Si un **`*.controller.ts`** supera ~400–500 líneas o mezcla dominios claros (p. ej. borradores + tareas + propiedades técnicas en un solo archivo):

1. Crear carpeta **`src/controllers/<nombre-dominio>/`** (ej. `agent-drafts/`) con **solo handlers HTTP** (un archivo por grupo de rutas o recurso).
2. Mover constantes, esquemas Zod, serialización, acceso Firestore reutilizable, etc. a **`src/utils/<nombre-dominio>/`**.
3. Exponer handlers desde **`controllers/<dominio>/index.ts`** (`export { postAgentDraft, getAgentDraft, … }`).
4. Actualizar imports en **`routes/`** y en otros módulos que consuman helpers (`@/utils/...`).

**Dependencias entre controladores:** vigilar imports cruzados (ej. drafts que importan `persistInitialBuilderSnapshotIfMissing` desde `@/utils/agent-detail/builder-form`) para no crear **ciclos**; extraer lo compartido a `utils/` o `services/` si hace falta.

## Referencias útiles

- Config y entorno: [`src/config.ts`](src/config.ts), [`.env.example`](.env.example).
- Errores HTTP unificados: [`src/lib/api-error.ts`](src/lib/api-error.ts).
- Paquete compartido: `@kai/shared` (ver monorepo root).

Tras cambios estructurales: `bunx tsc -p apps/api/tsconfig.json --noEmit` desde `apps/api/`.
