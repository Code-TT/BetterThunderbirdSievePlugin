"use strict";

const { Services } = ChromeUtils.importESModule(
  "resource://gre/modules/Services.sys.mjs"
);

/* Background: beschafft Sieve-Regeln (Proxy-Stub oder Bundled-Dump für den PoC),
 * hält sie im Speicher + storage und injiziert sie via Experiment-API in die
 * Filter-Liste. Klick auf eine Sieve-Zeile → Viewer (read-only).
 *
 * Quelle-Reihenfolge:
 *  1. lokaler Proxy-Stub  http://127.0.0.1:9420/api/sieve/scripts  (falls er läuft)
 *  2. gebündelter managesieve-Dump  data/sieve-dump.json  (PoC-Fallback)
 * Server-Sieve wird NIEMALS geschrieben. */

const PROXY_STUB_URL = "http://127.0.0.1:9420/api/sieve/scripts";
const DEFAULT_MODE = "all";

let cachedRows = [];
let cachedScripts = {};
let cachedMode = DEFAULT_MODE;

browser.runtime.onMessage.addListener(async (msg) => {
  if (msg && msg.type === "getRule") {
    const rule = cachedRows.find((r) => r.id === msg.id);
    return rule ? { rule, script: cachedScripts[rule.scriptName] || "" } : null;
  }
  if (msg && msg.type === "refresh") {
    await refreshAndInject();
    return { ok: true };
  }
  return null;
});

async function fetchFromProxy() {
  try {
    const res = await fetch(PROXY_STUB_URL, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) throw new Error(`proxy stub ${res.status}`);
    const data = await res.json();
    return Array.isArray(data.rules) ? data : null;
  } catch {
    return null;
  }
}

async function fetchFromBundledDump() {
  const res = await fetch(browser.runtime.getURL("data/sieve-dump.json"));
  if (!res.ok) return null;
  return res.json();
}

async function refreshAndInject() {
  let data = await fetchFromProxy();
  let source = "proxy";
  if (!data) {
    data = await fetchFromBundledDump();
    source = "bundled-dump";
  }
  if (!data) {
    data = { rules: [], scripts: {} };
    source = "empty";
  }
  cachedRows = data.rules.map((r) => ({ ...r, source }));
  cachedScripts = data.scripts || {};

  await browser.storage.local.set({ lastRefresh: Date.now(), source });
  await browser.sieveView.injectRows(cachedRows, cachedMode);
}

/* Periodisches Refresh: holt beim Öffnen neuer Filter-Fenster frisch. */
setInterval(refreshAndInject, 60 * 1000);

/* Klick auf Sieve-Zeile (aus dem privilegierten Experiment-Kontext) → Viewer öffnen. */
Services.obs.addObserver((subject) => {
  try {
    const { ruleId } = subject.wrappedJSObject;
    browser.sieveView.openViewer(ruleId);
  } catch (e) {
    console.error("sieve-view open request failed", e);
  }
}, "sieve-view-open-request");

refreshAndInject().catch((e) => console.error("sieve-view initial refresh failed", e));
