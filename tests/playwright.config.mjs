import { fileURLToPath } from "node:url";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

export default defineConfig({
  testDir: path.join(root, "tests"),
  timeout: 20_000,
  retries: 0,
  workers: 1,
  use: {
    baseURL: `file://${path.join(root, "addon/ui")}`,
    browserName: "chromium",
    viewport: { width: 800, height: 640 },
  },
  expect: { timeout: 5_000 },
});
