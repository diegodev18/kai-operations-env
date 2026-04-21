/**
 * Asistente E2E para el constructor de agentes (modo formulario).
 *
 * Variables de entorno (ver README de apps/web):
 * - FORM_BUILDER_BASE_URL — por defecto http://localhost:3000
 * - PLAYWRIGHT_STORAGE_STATE — JSON de sesión (crear con: bun run test:e2e:auth)
 * - FORM_BUILDER_PAUSE_LOGIN=1 — si aparece login, page.pause() para entrar a mano (sin storage state)
 * - FORM_BUILDER_STOP_AT=before-review — solo avanza hasta el paso Revisión (sin crear agente)
 * - FORM_BUILDER_NO_PAUSE_END=1 — no llama a page.pause() al final (CI o cierre automático)
 * - FORM_BUILDER_PAUSE_BEFORE_NEXT=1 — pausa en el inspector antes de cada clic en «Siguiente» (revisar y luego Resume)
 * - FORM_BUILDER_TOOL_MANUAL=1 — tras Herramientas, entra al subpaso «Manual de herramientas», espera la IA y rellena markdown en vista raw antes de ir a Pipelines
 *
 * En local, al llegar a Revisión se hace page.pause() por defecto (salvo CI o NO_PAUSE_END).
 * El Inspector de Playwright es otra ventana: hay que pulsar «Resume» para que el test termine.
 *
 * @see https://playwright.dev/docs/test-ui-mode
 */
import { expect, test, type Page } from "@playwright/test";

const STOP_AT = process.env.FORM_BUILDER_STOP_AT ?? "before-review";

function pauseBeforeSeguirEnabled() {
  return process.env.FORM_BUILDER_PAUSE_BEFORE_NEXT === "1" && !process.env.CI;
}

/** Pausa en Playwright Inspector antes de pulsar Siguiente (revisar UI → Resume). */
async function pauseBeforeSeguir(page: Page, context: string) {
  if (!pauseBeforeSeguirEnabled()) return;
  console.log(
    `\n[agent-form-builder e2e] Pausa antes de «Siguiente» (${context}). Abre el Playwright Inspector y pulsa «Resume» cuando quieras que el test pulse Siguiente.\n`,
  );
  await page.pause();
}

test.describe.configure({ mode: "serial" });

test.beforeEach(({ page }) => {
  page.on("dialog", (d) => {
    void d.accept();
  });
});

async function dismissDynamicBlockIfAny(page: Page) {
  const skip = page.getByTestId("form-builder-dynamic-skip");
  if (await skip.isVisible({ timeout: 2500 }).catch(() => false)) {
    await skip.click();
    await expect(skip).toBeHidden({ timeout: 15_000 });
  }
}

async function clickFormNext(page: Page) {
  await dismissDynamicBlockIfAny(page);
  const next = page.getByTestId("form-builder-next");
  await expect(next).toBeVisible({ timeout: 60_000 });
  // Tras pulsar, Negocio/Personalidad pueden poner "Analizando…" en el mismo botón
  await expect(next).not.toContainText("Analizando", { timeout: 180_000 });
  await expect(next).toBeEnabled({ timeout: 180_000 });
  await pauseBeforeSeguir(page, "paso explícito");
  await next.click();
}

/**
 * Pulsar Siguiente y, si la IA muestra el bloque dinámico (sin barra inferior), Omitir y repetir.
 * Espera a que termine "Analizando…" antes de exigir el botón habilitado (evita falso bloqueo en Negocio/Personalidad).
 */
async function advanceToNextSectionHeading(page: Page, nextTitle: string) {
  await dismissDynamicBlockIfAny(page);
  const sectionTitle = page.getByTestId("form-builder-section-title");
  const next = page.getByTestId("form-builder-next");
  const skip = page.getByTestId("form-builder-dynamic-skip");

  async function atTarget() {
    if (!(await sectionTitle.isVisible().catch(() => false))) return false;
    const t = (await sectionTitle.innerText()).trim();
    return t === nextTitle;
  }

  for (let attempt = 0; attempt < 15; attempt++) {
    if (await atTarget()) return;

    if (await skip.isVisible({ timeout: 3000 }).catch(() => false)) {
      await skip.click();
      await expect(skip).toBeHidden({ timeout: 45_000 });
      continue;
    }

    if (await next.isVisible({ timeout: 8000 }).catch(() => false)) {
      await expect(next).not.toContainText("Analizando", { timeout: 180_000 });
      if (!(await next.isVisible().catch(() => false))) continue;
      if (await skip.isVisible().catch(() => false)) continue;
      await expect(next).toBeEnabled({ timeout: 90_000 });
      await pauseBeforeSeguir(page, `hacia «${nextTitle}» (intento ${attempt + 1})`);
      await next.click();
    } else {
      await Promise.race([
        skip.waitFor({ state: "visible", timeout: 180_000 }),
        sectionTitle.filter({ hasText: nextTitle }).waitFor({ state: "visible", timeout: 180_000 }),
      ]).catch(() => {});
    }

    await expect(sectionTitle)
      .toHaveText(nextTitle, { timeout: 60_000 })
      .catch(() => {});
    if (await atTarget()) return;
  }

  await waitForStepHeading(page, nextTitle);
}

async function waitForStepHeading(page: Page, title: string) {
  await expect(page.getByTestId("form-builder-section-title")).toHaveText(title, {
    timeout: 180_000,
  });
}

/**
 * Tras el primer «Siguiente» en Herramientas aparece el modal del manual de flujos.
 * Por defecto se omite; con `FORM_BUILDER_TOOL_MANUAL=1` se recorre el subpaso opcional.
 * Termina con el título de sección en **Pipelines**.
 */
async function completeToolManualOfferStep(page: Page) {
  const dialog = page
    .getByRole("dialog")
    .filter({ has: page.getByText("¿Revisar manual de herramientas?") });
  await expect(
    dialog.getByRole("heading", { name: /Revisar manual de herramientas/i }),
  ).toBeVisible({ timeout: 120_000 });

  if (process.env.FORM_BUILDER_TOOL_MANUAL === "1") {
    await dialog.getByRole("button", { name: "Sí, revisar" }).click();
    await waitForStepHeading(page, "Manual de herramientas");

    const genLine = page.getByText("Generando con IA…");
    if (await genLine.isVisible().catch(() => false)) {
      await expect(genLine).toBeHidden({ timeout: 180_000 });
    }

    await page
      .getByRole("switch", { name: /Vista visual; activar para texto raw/i })
      .click();

    const md = page.getByPlaceholder(
      "# Manual de herramientas — describe flujos por herramienta",
    );
    await expect(md).toBeVisible({ timeout: 30_000 });
    // Solo validamos que la vista raw esté disponible; no pisamos el manual generado.

    await clickFormNext(page);
  } else {
    await dialog.getByRole("button", { name: "No, continuar" }).click();
  }

  await waitForStepHeading(page, "Pipelines");
}

async function ensureLoggedInOrPause(page: Page) {
  const loginHeading = page.getByRole("heading", { name: "Inicia sesión" });
  const plantillas = page.getByRole("heading", { name: "Plantillas", level: 2 });

  await Promise.race([
    plantillas.waitFor({ state: "visible", timeout: 120_000 }),
    loginHeading.waitFor({ state: "visible", timeout: 120_000 }),
  ]);

  if (await loginHeading.isVisible().catch(() => false)) {
    if (process.env.FORM_BUILDER_PAUSE_LOGIN === "1") {
      console.log(
        "\n[agent-form-builder e2e] Pantalla de login: abre el Inspector de Playwright y pulsa «Resume» tras iniciar sesión.\n",
      );
      await page.pause();
    } else {
      throw new Error(
        "Sin sesión en /agents/new. Opciones:\n" +
          "  1) Crear e2e/auth.json: E2E_TEST_EMAIL=… E2E_TEST_PASSWORD=… bun run test:e2e:auth (luego bun run test:e2e:form; se usa el archivo automáticamente)\n" +
          "  2) PLAYWRIGHT_STORAGE_STATE=/ruta/a/auth.json\n" +
          "  3) FORM_BUILDER_PAUSE_LOGIN=1 para loguearte en el inspector de Playwright",
      );
    }
    await plantillas.waitFor({ state: "visible", timeout: 180_000 });
  }
}

async function fillBusinessStep(page: Page) {
  await waitForStepHeading(page, "Negocio");

  await page
    .getByPlaceholder("Ej: Tienda de Ropa Moda Elegante")
    .fill("E2E Demo Negocio");

  const industrySelect = page.locator("select").first();
  if ((await industrySelect.inputValue().catch(() => "")) === "") {
    await industrySelect.selectOption("Retail");
  }

  await page
    .getByPlaceholder("¿Qué problema principal resuelve tu negocio?")
    .fill("Negocio de prueba E2E: vendemos productos de ejemplo y atendemos consultas.");
  await page
    .getByPlaceholder("¿Quiénes son tus clientes ideales?")
    .fill("Pequeñas empresas y consumidores en México.");
  await page
    .getByPlaceholder("¿Cómo debería comportarse el agente?")
    .fill("Asesor amable que responde dudas y orienta al cliente.");

  const esc = page.getByPlaceholder(
    "Ej: Si pide hablar con un humano, ofrecer transferencia",
  );
  await esc.fill("Si el usuario pide un humano, ofrecer transferencia.");
  await page.getByRole("button", { name: "Añadir", exact: true }).first().click();

  await page.locator("div").filter({ hasText: /^País/ }).locator("select").first().selectOption("MX");

  const tz = page.locator("div").filter({ hasText: "Zona horaria" }).locator("select").first();
  if (await tz.isVisible().catch(() => false)) {
    const opts = await tz.locator("option").count();
    if (opts > 1) {
      const value = await tz.locator("option").nth(1).getAttribute("value");
      if (value) await tz.selectOption(value);
    }
  }

  // Responsable viene de la sesión (readOnly); sin valor, "Siguiente" no se habilita.
  await expect(page.getByTestId("form-builder-owner-name")).not.toHaveValue("", {
    timeout: 120_000,
  });
}

async function fillPersonalityStep(page: Page) {
  await waitForStepHeading(page, "Personalidad");
  const agentName = page.getByTestId("form-builder-agent-name");
  const agentPersonality = page.getByTestId("form-builder-agent-personality");
  await expect(agentName).toBeVisible({ timeout: 60_000 });
  await expect(agentPersonality).toBeVisible({ timeout: 60_000 });
  await agentName.fill("Asistente E2E");
  await agentPersonality.fill("Profesional, claro y breve. Responde con cortesía.");
  await page.getByRole("button", { name: "Moderados" }).click();
  await expect(page.getByTestId("form-builder-next")).toBeEnabled({ timeout: 60_000 });
}

async function fillFlowQuestions(page: Page) {
  await waitForStepHeading(page, "Flujos");

  await expect(
    page.getByText("Preparando preguntas adaptadas a tu negocio…"),
  ).toBeHidden({ timeout: 180_000 });

  const retry = page.getByRole("button", { name: "Reintentar" });
  if (await retry.isVisible({ timeout: 5000 }).catch(() => false)) {
    await retry.click();
    await expect(
      page.getByText("Preparando preguntas adaptadas a tu negocio…"),
    ).toBeHidden({ timeout: 180_000 });
  }

  const blocks = page
    .locator(".max-w-2xl .space-y-6 > div")
    .filter({ has: page.locator("> label.text-sm") });
  const n = await blocks.count();
  for (let i = 0; i < n; i++) {
    const block = blocks.nth(i);
    const chip = block.locator("button.rounded-full.border").first();
    if (await chip.isVisible().catch(() => false)) {
      await chip.click().catch(() => {});
      continue;
    }
    const ta = block.locator("textarea").first();
    if (await ta.isVisible().catch(() => false)) {
      if (!(await ta.inputValue()).trim()) await ta.fill("Respuesta E2E automática.");
      continue;
    }
    const inp = block.locator('input[type="text"]').first();
    if (await inp.isVisible().catch(() => false)) {
      if (!(await inp.inputValue()).trim()) await inp.fill("Respuesta E2E automática.");
    }
  }
}

test("form builder: rellenar y avanzar hasta Revisión (UI)", async ({ page }) => {
  await page.goto("/agents/new?mode=form", { waitUntil: "domcontentloaded" });

  await ensureLoggedInOrPause(page);

  await waitForStepHeading(page, "Plantillas");

  await page.getByRole("button", { name: /Asistente de Ventas/ }).click();
  await waitForStepHeading(page, "Negocio");

  await fillBusinessStep(page);

  await advanceToNextSectionHeading(page, "Personalidad");

  await fillPersonalityStep(page);
  await advanceToNextSectionHeading(page, "Avanzado");
  await clickFormNext(page);

  await fillFlowQuestions(page);
  await clickFormNext(page);

  await waitForStepHeading(page, "Herramientas");
  await clickFormNext(page);

  await completeToolManualOfferStep(page);

  await clickFormNext(page);

  if (STOP_AT === "before-review") {
    await waitForStepHeading(page, "Revisión");
    if (!process.env.CI && process.env.FORM_BUILDER_NO_PAUSE_END !== "1") {
      console.log(
        "\n[agent-form-builder e2e] Pausa en Revisión: busca la ventana «Playwright Inspector», pulsa «Resume» cuando termines de probar la UI.\n",
      );
      await page.pause();
    }
  }
});
