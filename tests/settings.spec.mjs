/* Playwright-Tests Phase 4: Settings-Seite (addon/ui/options.html) und
 * Verbindungs-Fallback im Editor. Settings via localStorage-Fallback (kein
 * browser-Objekt im Static-Server-Kontext), Netz via window.__TEST_DATA__.fakeFetch. */
import { test, expect } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const UI_DIR = path.join(ROOT, "addon/ui");
const OPTIONS_URL = "http://127.0.0.1:9430/ui/options.html";
const EDITOR_URL = "http://127.0.0.1:9430/ui/editor.html";

test("Options-Seite zeigt Default-Proxy-URL und Standard-Konto", async ({ page }) => {
  await page.goto(OPTIONS_URL);
  await page.waitForFunction(() => !!window.__options);
  await expect(page.locator("#proxy-url")).toHaveValue("http://127.0.0.1:9421");
  await expect(page.locator("#account-select")).toHaveValue("thomas@trella.de");
  await expect(page.locator("#account-custom")).toBeHidden();
});

test("Benutzerdefiniertes Konto zeigt Freitextfeld, Speichern schreibt sanitisierte Settings", async ({ page }) => {
  await page.goto(OPTIONS_URL);
  await page.waitForFunction(() => !!window.__options);
  await page.selectOption("#account-select", "__custom__");
  await expect(page.locator("#account-custom")).toBeVisible();
  await page.fill("#account-custom", "ops@trella.de");
  await page.fill("#proxy-url", "127.0.0.1:9999"); // ohne Scheme, mit Slash am Ende
  await page.click("#btn-save");
  await expect(page.locator("#save-status")).toContainText("gespeichert");
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("settings") || "{}"));
  expect(stored.proxyUrl).toBe("http://127.0.0.1:9999");
  expect(stored.account).toBe("ops@trella.de");
});

test("Verbindungstest: Proxy erreichbar → OK mit Skriptzahl", async ({ page }) => {
  await page.addInitScript(() => {
    window.__TEST_DATA__ = {
      fakeFetch: async () =>
        new Response(JSON.stringify({ scripts: [{ name: "sogo" }, { name: "test" }], active: "sogo" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    };
  });
  await page.goto(OPTIONS_URL);
  await page.waitForFunction(() => !!window.__options);
  await page.click("#btn-test");
  await expect(page.locator("#test-result")).toContainText("Verbindung OK");
  await expect(page.locator("#test-result")).toContainText("2 Skript(e)");
});

test("Verbindungstest: Proxy nicht erreichbar → verständlicher Fehler, kein roher Fetch-Fehler", async ({ page }) => {
  await page.addInitScript(() => {
    window.__TEST_DATA__ = {
      fakeFetch: async () => {
        throw new TypeError("Failed to fetch");
      },
    };
  });
  await page.goto(OPTIONS_URL);
  await page.waitForFunction(() => !!window.__options);
  await page.click("#btn-test");
  await expect(page.locator("#test-result")).toContainText("Verbindung fehlgeschlagen");
  await expect(page.locator("#test-result")).toContainText("nicht erreichbar");
  await expect(page.locator("#test-result")).not.toContainText("TypeError");
});

test("Editor: Proxy nicht erreichbar → Hinweisbox mit Start-Anleitung statt roher Fehlermeldung", async ({ page }) => {
  await page.addInitScript(() => {
    window.__TEST_NO_AUTOSTART__ = true;
    // absichtlich OHNE __TEST_DATA__.script → loadScript geht über den Client/Fake-Fetch
    window.__TEST_DATA__ = {
      fakeFetch: async () => {
        throw new TypeError("Failed to fetch");
      },
    };
  });
  await page.goto(EDITOR_URL);
  await page.waitForFunction(() => !!window.__editor);
  await page.evaluate(() => window.__editor.init());
  await expect(page.locator("#connection-box")).toBeVisible();
  await expect(page.locator("#connection-detail")).toContainText("nicht erreichbar");
  await expect(page.locator("#connection-box")).toContainText("sieveproxy");
  await expect(page.locator("#btn-open-settings")).toBeVisible();
  await expect(page.locator("#status")).toContainText("Proxy nicht erreichbar");
});
