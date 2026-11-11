/* Sieve-Editor-Logik: Vorbefüllung aus dem Parser, Live-Validierung,
 * Write-Back mit Konflikt-Erkennung (kein stilles Überschreiben), Delete mit Doppel-Check. */
"use strict";

import { parseSieve, serializeSieve, extractRules, SieveSyntaxError } from "../lib/sieve/parser.mjs";
import { SieveClient, SieveConflictError } from "../lib/sieve/client.mjs";

const $ = (id) => document.getElementById(id);

function clientFromEnv() {
  if (window.__TEST_DATA__ && window.__TEST_DATA__.fakeFetch) {
    return new SieveClient({ baseUrl: "http://bridge.test", fetchImpl: window.__TEST_DATA__.fakeFetch });
  }
  return new SieveClient({ baseUrl: window.__BRIDGE_URL__ || "http://127.0.0.1:9421" });
}

const state = {
  scriptName: null,
  fingerprint: null,
  active: false,
  saving: false,
};

/* ------------------------------------------------------------ Rendering --- */

function renderParsed(text) {
  const list = $("rule-list");
  const err = $("parse-error");
  list.textContent = "";
  try {
    const ast = parseSieve(text);
    const reqs = [];
    for (const c of ast.commands) {
      if (c.kind === "require") {
        for (const a of c.args) {
          if (a.type === "stringlist") a.strings.filter((s) => !s.sep).forEach((s) => reqs.push(s.value));
          else if (a.type === "string") reqs.push(a.value);
        }
      }
    }
    const liReq = document.createElement("li");
    liReq.innerHTML = `<span class="cond">require: ${reqs.map((r) => `<code>${escapeHtml(r)}</code>`).join(", ") || "—"}</span>`;
    list.appendChild(liReq);
    for (const rule of extractRules(ast)) {
      const li = document.createElement("li");
      const conds = rule.conditions
        .map((c) => `${c.test} ${c.match || ""} ${c.headers.join("/")} ≈ ${c.values.join(" | ")}`.replace(/\s+/g, " ").trim())
        .join(rule.combinator === "anyof" ? " ODER " : " UND ");
      const acts = rule.actions
        .map((a) => `${a.name} → <span class="folder">${escapeHtml(a.args.join(", "))}</span>`)
        .join("; ");
      li.innerHTML = `<span class="cond">${escapeHtml(conds)}</span> <span class="arrow">⇒</span> ${acts}`;
      list.appendChild(li);
    }
    err.hidden = true;
    return true;
  } catch (e) {
    err.textContent = `Parse-Fehler: ${e.message}`;
    err.hidden = false;
    return false;
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function setBadge(active) {
  const b = $("script-active");
  b.textContent = active ? "aktiv" : "inaktiv";
  b.classList.toggle("active", active);
  b.classList.toggle("inactive", !active);
}

function setStatus(msg, cls = "") {
  const s = $("status");
  s.textContent = msg;
  s.className = cls;
}

/* ------------------------------------------------------------- Validierung */

function validate() {
  const text = $("script-text").value;
  const v = $("validation");
  const ok = renderParsed(text);
  if (ok) {
    v.textContent = "Syntax OK";
    v.className = "ok";
  } else {
    v.textContent = "Syntax-Fehler — Speichern gesperrt";
    v.className = "invalid";
  }
  $("btn-save").disabled = !ok || state.saving;
  return ok;
}

/* ---------------------------------------------------------------- Laden --- */

export async function loadScript(name) {
  const client = clientFromEnv();
  try {
    let data;
    if (window.__TEST_DATA__ && window.__TEST_DATA__.script) {
      data = window.__TEST_DATA__.script;
    } else {
      data = await client.getScript(name);
    }
    state.scriptName = data.name;
    state.fingerprint = data.fingerprint;
    state.active = !!data.active;
    $("script-name").textContent = data.name;
    setBadge(state.active);
    $("script-text").value = data.text;
    validate();
    setStatus(`Geladen: ${data.name} (Stand ${data.fingerprint ? data.fingerprint.slice(0, 8) : "?"}…)`);
    $("connection-source").textContent =
      window.__TEST_DATA__ ? "Testdaten" : `Proxy ${client.baseUrl.replace(/^https?:\/\//, "")}`;
  } catch (e) {
    setStatus(`Laden fehlgeschlagen: ${e.message}`, "error");
  }
}

/* ----------------------------------------------------------- Speichern ---- */

export async function saveScript() {
  if (!validate() || state.saving) return;
  state.saving = true;
  $("btn-save").disabled = true;
  const client = clientFromEnv();
  const text = $("script-text").value;
  try {
    const ifUnchanged = $("force-overwrite").checked ? undefined : state.fingerprint;
    const res = await client.putScript(state.scriptName, text, { ifUnchanged });
    state.fingerprint = res.fingerprint;
    $("conflict-box").hidden = true;
    $("force-overwrite").checked = false;
    setStatus(`Gespeichert (neuer Stand ${res.fingerprint.slice(0, 8)}…)`, "saved");
  } catch (e) {
    if (e instanceof SieveConflictError) {
      state.fingerprint = e.details.currentFingerprint || state.fingerprint;
      $("conflict-detail").textContent = e.message;
      $("conflict-box").hidden = false;
      setStatus("Konflikt — nichts überschrieben. Erst prüfen, dann entscheiden.", "error");
    } else {
      setStatus(`Speichern fehlgeschlagen: ${e.message}`, "error");
    }
  } finally {
    state.saving = false;
    $("btn-save").disabled = false;
  }
}

/* -------------------------------------------------------------- Aktionen -- */

async function activateScript() {
  const client = clientFromEnv();
  try {
    await client.setActive(state.scriptName);
    state.active = true;
    setBadge(true);
    setStatus(`${state.scriptName} aktiviert`, "saved");
  } catch (e) {
    setStatus(`Aktivieren fehlgeschlagen: ${e.message}`, "error");
  }
}

let deleteArmed = false;
async function onDeleteButton() {
  if (!deleteArmed) {
    deleteArmed = true;
    $("btn-delete").textContent = "Wirklich löschen?";
    setTimeout(() => {
      deleteArmed = false;
      $("btn-delete").textContent = "Löschen…";
    }, 4000);
    return;
  }
  deleteArmed = false;
  $("btn-delete").textContent = "Löschen…";
  if (state.active) {
    setStatus("Aktives Skript kann nicht gelöscht werden — erst deaktivieren/anderes aktivieren.", "error");
    return;
  }
  const dlg = $("confirm-dialog");
  $("confirm-name").textContent = state.scriptName;
  dlg.showModal();
}

async function onConfirmDelete() {
  $("confirm-dialog").close();
  const client = clientFromEnv();
  try {
    await client.deleteScript(state.scriptName, { confirm: true, fingerprint: state.fingerprint });
    setStatus(`${state.scriptName} gelöscht`, "saved");
    $("script-text").value = "";
    validate();
  } catch (e) {
    setStatus(`Löschen fehlgeschlagen: ${e.message}`, "error");
  }
}

/* ----------------------------------------------------------------- Init --- */

export function init() {
  $("script-text").addEventListener("input", validate);
  $("btn-save").addEventListener("click", saveScript);
  $("btn-activate").addEventListener("click", activateScript);
  $("btn-delete").addEventListener("click", onDeleteButton);
  $("confirm-delete").addEventListener("click", onConfirmDelete);
  $("confirm-cancel").addEventListener("click", () => $("confirm-dialog").close());
  $("btn-reload").addEventListener("click", () => state.scriptName && loadScript(state.scriptName));

  const name = new URLSearchParams(location.search).get("script") || "sogo";
  loadScript(name);
}

// Test-Hook: init() von Playwright kontrolliert aufrufbar
if (!window.__TEST_NO_AUTOSTART__) init();
window.__editor = { state, loadScript, saveScript, init, validate };
