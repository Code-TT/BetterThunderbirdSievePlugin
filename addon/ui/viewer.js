/* Read-only Viewer für eine Sieve-Regel. TB-Fensterstil (eigene, an TB angelehnte Palette). */
"use strict";

/* Test-Hook: Playwright injiziert window.__TEST_DATA__ vor Skriptstart →
 * deterministische Daten ohne Proxy/Backend. */
async function getRule(id) {
  if (window.__TEST_DATA__ && window.__TEST_DATA__.rules) {
    const rule = window.__TEST_DATA__.rules.find((r) => r.id === id);
    return rule
      ? { rule, script: (window.__TEST_DATA__.scripts || {})[rule.scriptName] || "" }
      : null;
  }
  return browser.runtime.sendMessage({ type: "getRule", id });
}

function el(tag, attrs = {}, text) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text !== undefined) node.textContent = text;
  return node;
}

function render(rule, script) {
  document.title = `Sieve-Regel: ${rule.name} (read-only)`;
  document.getElementById("rule-name").textContent = rule.name;

  const active = document.getElementById("rule-active");
  active.textContent = rule.active ? "aktiv" : "inaktiv";
  active.classList.toggle("active", rule.active);
  active.classList.toggle("inactive", !rule.active);

  document.getElementById("rule-source").textContent =
    rule.source === "proxy" ? "Server (Sieve) via Proxy" : "Server (Sieve)";

  const tbody = document.querySelector("#conditions tbody");
  tbody.textContent = "";
  for (const c of rule.conditions || []) {
    const tr = el("tr", {});
    tr.appendChild(el("td", { "data-field": c.field }, c.field));
    tr.appendChild(el("td", { "data-op": c.op }, c.op));
    tr.appendChild(el("td", { "data-value": c.value }, c.value));
    tbody.appendChild(tr);
  }
  if (rule.combinator) {
    document
      .getElementById("conditions")
      .setAttribute("data-combinator", rule.combinator);
  }

  const a = rule.action || {};
  document.getElementById("action-summary").textContent =
    `${a.type} → ${a.target}`;

  document.getElementById("script-text").textContent = script || "(kein Skripttext)";
}

function showError(msg) {
  const box = document.getElementById("error-message");
  box.textContent = msg;
  box.hidden = false;
}

async function init() {
  const id = new URLSearchParams(location.search).get("rule");
  if (!id) return showError("Keine Regel-ID übergeben.");
  const result = await getRule(id);
  if (!result || !result.rule) return showError(`Regel "${id}" nicht gefunden.`);
  render(result.rule, result.script);
}

init();
