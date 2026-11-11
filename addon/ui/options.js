/* Einstellungslogik (Phase 4): Konto-Auswahl, Proxy-URL, Verbindungstest.
 * Speicherung via settings.mjs (browser.storage.local bzw. localStorage-Fallback). */
"use strict";

import { SieveClient } from "../lib/sieve/client.mjs";
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from "../lib/sieve/settings.mjs";

const $ = (id) => document.getElementById(id);

const state = {
  proxyUrl: DEFAULT_SETTINGS.proxyUrl,
  account: "",
};

function selectedAccount() {
  const sel = $("account-select").value;
  return sel === "__custom__" ? $("account-custom").value.trim() : sel;
}

function applyToForm(settings) {
  const known = [...$("account-select").options].map((o) => o.value);
  if (settings.account && known.includes(settings.account)) {
    $("account-select").value = settings.account;
  } else if (settings.account) {
    $("account-select").value = "__custom__";
    $("account-custom").value = settings.account;
    $("account-custom").hidden = false;
  } else {
    $("account-select").value = "thomas@trella.de";
  }
  $("proxy-url").value = settings.proxyUrl;
  state.proxyUrl = settings.proxyUrl;
  state.account = settings.account;
}

async function onTest() {
  const out = $("test-result");
  out.textContent = "Teste Verbindung…";
  out.className = "";
  const client = new SieveClient({ baseUrl: $("proxy-url").value, fetchImpl: window.__TEST_DATA__?.fakeFetch || undefined });
  try {
    const res = await client.listScripts();
    out.textContent = `Verbindung OK — ${res.scripts?.length ?? 0} Skript(e) gefunden.`;
    out.className = "ok";
  } catch (e) {
    out.textContent = `Verbindung fehlgeschlagen: ${e.message}`;
    out.className = "fail";
  }
}

async function onSave() {
  const clean = await saveSettings({ proxyUrl: $("proxy-url").value, account: selectedAccount() });
  state.proxyUrl = clean.proxyUrl;
  state.account = clean.account;
  $("save-status").textContent = "Einstellungen gespeichert.";
  $("test-result").textContent = "";
  $("test-result").className = "";
}

async function init() {
  applyToForm(await loadSettings());
  $("account-select").addEventListener("change", () => {
    $("account-custom").hidden = $("account-select").value !== "__custom__";
  });
  $("btn-test").addEventListener("click", onTest);
  $("btn-save").addEventListener("click", onSave);
}

if (!window.__TEST_NO_AUTOSTART__) init();

window.__options = { state, init, onSave, onTest };
