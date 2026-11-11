/* Playwright-Tests für den Sieve-Editor (addon/ui/editor.html).
 * Backend via window.__TEST_DATA__ + Mock-SieveClient (deterministisch, kein Server). */
import { test, expect } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const UI_DIR = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), "addon/ui");
const EDITOR_URL = "http://127.0.0.1:9430/ui/editor.html";

const SAMPLE = [
  'require ["fileinto"];',
  'if allof (address :contains "from" "aliexpress.com") {',
  '    fileinto "AliExpress";',
  "}",
].join("\n");

/** Fake-Bridge im Seitenkontext: echter SieveClient läuft gegen einen Fake-fetch. */
const BRIDGE_SCRIPT = (opts) => {
  const sample = [
    'require ["fileinto"];',
    'if allof (address :contains "from" "aliexpress.com") {',
    '    fileinto "AliExpress";',
    "}",
  ].join("\n");
  const state = { text: sample, fingerprint: "fp-read-12345678", active: opts.active };
  window.__bridgeCalls = { put: [], remove: [], activate: 0 };
  window.__TEST_DATA__ = {
    script: { name: "sogo", active: state.active, fingerprint: state.fingerprint, text: state.text },
    fakeFetch: async (url, init = {}) => {
      const u = new URL(url);
      const json = (code, obj) => new Response(JSON.stringify(obj), { status: code, headers: { "content-type": "application/json" } });
      if (init.method === "PUT") {
        const body = JSON.parse(init.body);
        window.__bridgeCalls.put.push(body);
        if (opts.conflictOnPut && body.if_unchanged) {
          return json(409, { error: "conflict: Skript wurde seit dem Lesen geändert", currentFingerprint: "fp-server-9999" });
        }
        state.text = body.text;
        state.fingerprint = "fp-new-abcdef01";
        return json(200, { fingerprint: state.fingerprint });
      }
      if (init.method === "DELETE") {
        window.__bridgeCalls.remove.push({ name: u.pathname.split("/")[2], confirm: u.searchParams.get("confirm") });
        if (state.active) return json(409, { error: "Aktives Skript kann nicht gelöscht werden" });
        if (u.searchParams.get("confirm") !== "1") return json(400, { error: "confirm=1 erforderlich" });
        return json(200, { deleted: "sogo" });
      }
      if (init.method === "POST" && u.pathname.endsWith("/activate")) {
        window.__bridgeCalls.activate++;
        state.active = true;
        return json(200, { activated: "sogo" });
      }
      return json(200, { name: "sogo", active: state.active, fingerprint: state.fingerprint, text: state.text });
    },
  };
};

async function openEditor(page, opts = {}) {
  await page.addInitScript((o) => {
    window.__TEST_NO_AUTOSTART__ = true;
    window.BRIDGE_SETUP = o;
  }, opts);
  // BRIDGE_SCRIPT als serialisierbare Funktion injizieren
  await page.addInitScript({ content: `window.__runBridge = ${BRIDGE_SCRIPT.toString()};` });
  await page.addInitScript(() => window.__runBridge(window.BRIDGE_SETUP));
  await page.goto(EDITOR_URL);
  await page.waitForFunction(() => !!window.__editor); // ES-Modul lädt asynchron
  await page.evaluate(() => window.__editor.init());
}

test("Vorbefüllung: Parser listet require und erkannte Regeln", async ({ page }) => {
  await openEditor(page);
  await expect(page.locator("#script-name")).toHaveText("sogo");
  await expect(page.locator("#rule-list")).toContainText("require: fileinto");
  await expect(page.locator("#rule-list")).toContainText("aliexpress.com");
  await expect(page.locator("#rule-list")).toContainText("AliExpress");
  await expect(page.locator("#validation")).toHaveText("Syntax OK");
});

test("Live-Validierung: Syntax-Fehler sperrt Speichern", async ({ page }) => {
  await openEditor(page);
  await page.fill("#script-text", 'if header :is "x" "y" {'); // fehlende '}' → parse error
  await expect(page.locator("#validation")).toContainText("Syntax-Fehler");
  await expect(page.locator("#btn-save")).toBeDisabled();
});

test("Speichern: PUT mit if_unchanged-Fingerprint, Status zeigt neuen Stand", async ({ page }) => {
  await openEditor(page);
  await page.fill("#script-text", SAMPLE + '\nif allof (address :contains "from" "z@example.com") {\n    fileinto "Z-Test";\n}\n');
  await page.click("#btn-save");
  await expect(page.locator("#status")).toContainText("Gespeichert");
  const calls = await page.evaluate(() => window.__bridgeCalls.put);
  expect(calls).toHaveLength(1);
  expect(calls[0].if_unchanged).toBe("fp-read-12345678");
  expect(calls[0].text).toContain("Z-Test");
});

test("Konflikt: 409 → Hinweis, kein stilles Überschreiben, kein force ohne Haken", async ({ page }) => {
  await openEditor(page, { conflictOnPut: true });
  await page.fill("#script-text", SAMPLE + "\n/* geändert */");
  await page.click("#btn-save");
  await expect(page.locator("#conflict-box")).toBeVisible();
  await expect(page.locator("#conflict-detail")).toContainText("seit dem Lesen");
  const calls = await page.evaluate(() => window.__bridgeCalls.put);
  // nicht forciert → es gab nur diesen einen PUT-Versuch, ohne Override
  expect(calls).toHaveLength(1);
  expect(calls[0].if_unchanged).toBe("fp-read-12345678");
  // Checkbox bleibt auf "nicht überschreiben"
  expect(await page.isChecked("#force-overwrite")).toBe(false);
});

test("Aktives Skript: Löschen wird mit Hinweis verweigert", async ({ page }) => {
  await openEditor(page, { active: true });
  await page.click("#btn-delete"); // arm
  await page.click("#btn-delete"); // fire
  await expect(page.locator("#status")).toContainText("Aktives Skript kann nicht gelöscht werden");
  const removes = await page.evaluate(() => window.__bridgeCalls.remove);
  expect(removes).toHaveLength(0);
});

test("Inaktives Skript: Doppel-Check-Dialog → DELETE", async ({ page }) => {
  await openEditor(page);
  await page.click("#btn-delete"); // arm
  await page.click("#btn-delete"); // dialog
  await expect(page.locator("#confirm-dialog")).toBeVisible();
  await page.click("#confirm-delete");
  await expect(page.locator("#status")).toContainText("gelöscht");
  const removes = await page.evaluate(() => window.__bridgeCalls.remove);
  expect(removes).toHaveLength(1);
  expect(removes[0].name).toBe("sogo");
});
