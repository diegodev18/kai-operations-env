#!/usr/bin/env node
/**
 * Wrapper: `--env=testing` | `--env=production` → FORM_BUILDER_BASE_URL
 * Example: node scripts/run-form-builder-e2e.mjs --env=production
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, "..");

const envArg = process.argv.find((a) => a.startsWith("--env="));
const envName = envArg?.split("=", 2)[1]?.toLowerCase() ?? "testing";

const baseURL =
  envName === "production"
    ? "https://atlas.talktokai.com"
    : "http://localhost:3000";

const playwrightBin = path.join(webRoot, "node_modules", ".bin", "playwright");
const result = spawnSync(
  playwrightBin,
  ["test", "e2e/agent-form-builder.smoke.spec.ts"],
  {
    cwd: webRoot,
    stdio: "inherit",
    env: { ...process.env, FORM_BUILDER_BASE_URL: baseURL },
    shell: process.platform === "win32",
  },
);

process.exit(result.status ?? 1);
