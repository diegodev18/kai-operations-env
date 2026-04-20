/**
 * Crea `e2e/auth.json` para reutilizar sesión en los E2E.
 *
 * Uso (desde apps/web, con la app en marcha):
 *   E2E_TEST_EMAIL=tu@correo.com E2E_TEST_PASSWORD='tuclave' bun run test:e2e:auth
 *
 * Luego:
 *   PLAYWRIGHT_STORAGE_STATE=./e2e/auth.json bun run test:e2e:form
 */
import path from "node:path";

import { expect, test } from "@playwright/test";

/** Ruta estable con cwd = apps/web (como en `bun run test:e2e:auth`). */
const authFile = path.join(process.cwd(), "e2e", "auth.json");

test("guardar estado de sesión en e2e/auth.json", async ({ page }) => {
  const email = process.env.E2E_TEST_EMAIL?.trim();
  const password = process.env.E2E_TEST_PASSWORD?.trim();
  if (!email || !password) {
    throw new Error(
      "Faltan E2E_TEST_EMAIL y E2E_TEST_PASSWORD.\n" +
        "Ejemplo:\n" +
        "  E2E_TEST_EMAIL=yo@empresa.com E2E_TEST_PASSWORD='tuclave' bun run test:e2e:auth",
    );
  }

  await page.goto("/agents/new?mode=form", { waitUntil: "domcontentloaded" });

  const plantillas = page.getByRole("heading", { name: "Plantillas", level: 2 });
  if (await plantillas.isVisible({ timeout: 8000 }).catch(() => false)) {
    await page.context().storageState({ path: authFile });
    return;
  }

  await expect(page.getByRole("heading", { name: "Inicia sesión" })).toBeVisible({
    timeout: 30_000,
  });
  await page.getByLabel("Correo").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();

  await plantillas.waitFor({ state: "visible", timeout: 90_000 });
  await page.context().storageState({ path: authFile });
});
