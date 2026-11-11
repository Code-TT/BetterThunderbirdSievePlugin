/* Playwright-Tests für den read-only Sieve-Viewer (addon/ui/viewer.html).
 * Daten via window.__TEST_DATA__ (deterministisch, kein Backend nötig). */
import { test, expect } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const UI_DIR = path.join(
  path.dirname(path.dirname(fileURLToPath(import.meta.url))),
  "addon/ui"
);
const VIEWER_URL = "file://" + path.join(UI_DIR, "viewer.html");

const TEST_DATA = {
  rules: [
    {
      id: "sogo:1",
      scriptName: "sogo",
      name: "aliexpress.com",
      summary: "from contains → fileinto AliExpress",
      active: true,
      source: "bundled-dump",
      combinator: "allof",
      conditions: [{ field: "from", op: "contains", value: "aliexpress.com" }],
      action: { type: "fileinto", target: "AliExpress" },
    },
    {
      id: "sogo:3",
      scriptName: "sogo",
      name: "facebook.com (+1)",
      summary: "from contains → fileinto Facebook",
      active: true,
      source: "proxy",
      combinator: "anyof",
      conditions: [
        { field: "from", op: "contains", value: "facebook.com" },
        { field: "from", op: "contains", value: "facebookmail.com" },
      ],
      action: { type: "fileinto", target: "Facebook" },
    },
  ],
  scripts: {
    sogo:
      'require ["fileinto"];\nif allof (address :contains "from" "aliexpress.com") {\n    fileinto "AliExpress";\n}\n',
  },
};

async function openViewer(page, ruleId) {
  await page.addInitScript((data) => {
    window.__TEST_DATA__ = data;
  }, TEST_DATA);
  await page.goto(`${VIEWER_URL}?rule=${encodeURIComponent(ruleId)}`);
}

test("zeigt Regel-Name, Aktiv-Status und Quelle", async ({ page }) => {
  await openViewer(page, "sogo:1");
  await expect(page.locator("#rule-name")).toHaveText("aliexpress.com");
  await expect(page.locator("#rule-active")).toHaveText("aktiv");
  await expect(page.locator("#rule-source")).toContainText("Server (Sieve)");
  await expect(page.locator(".readonly-note")).toBeVisible();
});

test("zeigt Bedingungen und Aktion korrekt", async ({ page }) => {
  await openViewer(page, "sogo:3");
  const rows = page.locator("#conditions tbody tr");
  await expect(rows).toHaveCount(2);
  await expect(page.locator("#conditions")).toHaveAttribute(
    "data-combinator",
    "anyof"
  );
  await expect(rows.first().locator("td[data-field]")).toHaveText("from");
  await expect(page.locator("#action-summary")).toHaveText("fileinto → Facebook");
});

test("zeigt Skript-Auszug aus dem Skripttext", async ({ page }) => {
  await openViewer(page, "sogo:1");
  await expect(page.locator("#script-text")).toContainText('fileinto "AliExpress"');
});

test("Fehlerfall: unbekannte Regel zeigt verständliche Meldung", async ({ page }) => {
  await openViewer(page, "does-not-exist");
  await expect(page.locator("#error-message")).toContainText("nicht gefunden");
});

test("kein aktives Formular — Viewer bleibt read-only", async ({ page }) => {
  await openViewer(page, "sogo:1");
  await expect(page.locator("form, input:not([type=hidden]), textarea, select")).toHaveCount(0);
  // versteckter Verbindungs-Hinweis-Button erlaubt, sichtbare Buttons bleiben 0
  await expect(page.locator("button:visible")).toHaveCount(0);
});
