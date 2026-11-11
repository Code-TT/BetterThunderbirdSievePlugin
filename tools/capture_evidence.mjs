/* Screenshot-Evidence Phase 4: Options-Seite + Editor-Verbindungs-Fallback. */
import { chromium } from "@playwright/test";
import { homedir } from "node:os";
import path from "node:path";

const out = (f) => path.join(homedir(), ".hermes/kanban/workspaces/t_debed280", f);
const b = await chromium.launch();

const p = await b.newPage({ viewport: { width: 700, height: 480 } });
await p.goto("http://127.0.0.1:9430/ui/options.html");
await p.waitForFunction(() => !!window.__options);
await p.screenshot({ path: out("evidence-options.png") });

const p2 = await b.newPage({ viewport: { width: 760, height: 560 } });
await p2.addInitScript(() => {
  window.__TEST_NO_AUTOSTART__ = true;
  window.__TEST_DATA__ = { fakeFetch: async () => { throw new TypeError("Failed to fetch"); } };
});
await p2.goto("http://127.0.0.1:9430/ui/editor.html");
await p2.waitForFunction(() => !!window.__editor);
await p2.evaluate(() => window.__editor.init());
await p2.waitForSelector("#connection-box:not([hidden])");
await p2.screenshot({ path: out("evidence-connection-fallback.png") });

await b.close();
console.log("screenshots ok");
