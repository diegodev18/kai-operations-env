This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## E2E: constructor de agentes (modo formulario)

Asistente con [Playwright](https://playwright.dev/) para rellenar el flujo de [`/agents/new?mode=form`](http://localhost:3000/agents/new?mode=form) en el navegador y **pausar en Revisión** para que puedas seguir a mano (probar “Crear agente”, etc.). No sustituye a un test de CI estable: depende de API, IA y sesión.

### Requisitos

1. App y API accesibles (por ejemplo `bun run dev` desde la raíz del monorepo).
2. Navegadores Playwright: `bun run test:e2e:install` (una vez, en `apps/web`).
3. **Sesión** (una de estas):
   - Generar **`e2e/auth.json`** con `bun run test:e2e:auth` (recomendado): ver bloque siguiente. Si ese archivo existe, **`test:e2e:form` lo usa solo** (no hace falta `PLAYWRIGHT_STORAGE_STATE`).
   - Otra ruta de estado: `PLAYWRIGHT_STORAGE_STATE=/ruta/auth.json` (tiene prioridad sobre `e2e/auth.json`).
   - Sin archivo: `FORM_BUILDER_PAUSE_LOGIN=1` para loguearte cuando abra el inspector.

### Crear `e2e/auth.json` (una vez)

Con la app en marcha (`localhost:3000`), desde **`apps/web`**:

```bash
E2E_TEST_EMAIL=tu@correo.com E2E_TEST_PASSWORD='tu_contraseña' bun run test:e2e:auth
```

Se escribe [`e2e/auth.json`](e2e/auth.json) (está en `.gitignore`). Si ya tenías sesión en el navegador del test, también guarda cookies.

Luego (con `e2e/auth.json` ya creado, no hace falta variable):

```bash
bun run test:e2e:form
```

### Variables de entorno

| Variable | Descripción |
|----------|-------------|
| `FORM_BUILDER_BASE_URL` | Base del front. Por defecto en `playwright.config.ts`: `http://localhost:3000`. Producción: `https://atlas.talktokai.com`. |
| `E2E_TEST_EMAIL` / `E2E_TEST_PASSWORD` | Credenciales solo para `bun run test:e2e:auth` (crear `e2e/auth.json`). |
| `PLAYWRIGHT_STORAGE_STATE` | Ruta al JSON de sesión; si no se define y existe `e2e/auth.json`, Playwright lo carga solo (`playwright.config.ts`). |
| `FORM_BUILDER_PAUSE_LOGIN=1` | Si no hay sesión y aparece el login, abre la pausa de Playwright para que entres a mano (alternativa a `PLAYWRIGHT_STORAGE_STATE`). |
| `FORM_BUILDER_STOP_AT` | `before-review` (por defecto): avanza hasta el paso **Revisión** y no pulsa “Crear agente”. |
| `FORM_BUILDER_NO_PAUSE_END=1` | No llama a `page.pause()` al final (por ejemplo para que el test termine solo en local). |
| `FORM_BUILDER_PAUSE_BEFORE_NEXT=1` | Antes de cada clic en **Siguiente**, abre el inspector de Playwright; revisa la pantalla y pulsa **Resume** para que el test continúe (no aplica en CI). |
| `CI` | Si está definido, el navegador va en **headless**. |

### Comandos

```bash
# Instalar Chromium para Playwright (una vez)
bun run test:e2e:install

# Local (usa base URL por defecto o la de config)
bun run test:e2e:form

# Tras llegar a Revisión el test pausa en local (Playwright Inspector): pulsa «Resume» para cerrar.
# Sin pausa al final:
FORM_BUILDER_NO_PAUSE_END=1 bun run test:e2e:form

# Sin sesión guardada: pausar en la pantalla de login, entrar a mano y luego «Resume» en el inspector
FORM_BUILDER_PAUSE_LOGIN=1 bun run test:e2e:form

# Con e2e/auth.json generado por test:e2e:auth (carga automática)
bun run test:e2e:form

# Pausa antes de cada «Siguiente» (mismo efecto que FORM_BUILDER_PAUSE_BEFORE_NEXT=1)
bun run test:e2e:form:step

# Atajos con flag --env (wrapper)
bun run test:e2e:form:testing
bun run test:e2e:form:production
```

Si el terminal parece quieto en Revisión, no está colgado: **`page.pause()`** espera a que abras el **Playwright Inspector** (suele ser otra ventana) y pulses **Resume**. Con `FORM_BUILDER_NO_PAUSE_END=1` no hay esa pausa.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
