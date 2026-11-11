import { fileURLToPath } from "node:url";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

export default defineConfig({
  testDir: path.join(root, "tests"),
  timeout: 20_000,
  retries: 0,
  workers: 1,
  /* ES-Module können nicht über file:// geladen werden (CORS) → kleiner Static-Server. */
  webServer: {
    command: "node tools/ui-server.mjs 9430",
    port: 9430,
    reuseExistingServer: true,
    cwd: root,
  },
  use: {
    baseURL: `http://127.0.0.1:9430`,
    browserName: "chromium",
    viewport: { width: 800, height: 640 },
  },
  expect: { timeout: 5_000 },
});
