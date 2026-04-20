import fs from "node:fs";
import path from "node:path";

import { defineConfig, devices } from "@playwright/test";

const baseURL =
  process.env.FORM_BUILDER_BASE_URL?.trim() || "http://localhost:3000";

const envStorage = process.env.PLAYWRIGHT_STORAGE_STATE?.trim();
const defaultAuthPath = path.join(process.cwd(), "e2e", "auth.json");
const storageState =
  envStorage && envStorage.length > 0
    ? envStorage
    : fs.existsSync(defaultAuthPath)
      ? defaultAuthPath
      : undefined;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 10 * 60 * 1000,
  expect: { timeout: 120_000 },
  reporter: process.env.CI ? "github" : "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    trace: "on-first-retry",
    headless: !!process.env.CI,
    ...(storageState ? { storageState } : {}),
  },
});
