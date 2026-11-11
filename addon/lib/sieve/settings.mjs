/* Settings — geteilte Einstellungen für Editor/Viewer/Options (Phase 4).
 * Speicherort: browser.storage.local (Add-on-Kontext); Fallback localStorage
 * für Playwright/Static-Server-Kontext (dort gibt es kein browser-Objekt).
 * Test-Hook: window.__TEST_SETTINGS__ überschreibt Lesezugriffe deterministisch. */
"use strict";

export const DEFAULT_SETTINGS = Object.freeze({
  proxyUrl: "http://127.0.0.1:9421",
  account: "",
});

const STORAGE_KEY = "settings";

export function normalizeProxyUrl(url) {
  const trimmed = String(url || "").trim();
  if (!trimmed) return DEFAULT_SETTINGS.proxyUrl;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  return withScheme.replace(/\/+$/, "");
}

export function sanitizeSettings(raw) {
  return {
    proxyUrl: normalizeProxyUrl(raw && raw.proxyUrl),
    account: String((raw && raw.account) || "").trim(),
  };
}

export async function loadSettings() {
  if (typeof window !== "undefined" && window.__TEST_SETTINGS__) {
    return sanitizeSettings({ ...DEFAULT_SETTINGS, ...window.__TEST_SETTINGS__ });
  }
  try {
    if (typeof browser !== "undefined" && browser?.storage?.local?.get) {
      const got = await browser.storage.local.get(STORAGE_KEY);
      return sanitizeSettings({ ...DEFAULT_SETTINGS, ...(got && got[STORAGE_KEY]) });
    }
  } catch {
    /* weiter zum localStorage-Fallback */
  }
  try {
    if (typeof localStorage !== "undefined") {
      return sanitizeSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") });
    }
  } catch {
    /* kaputte Daten → Defaults */
  }
  return sanitizeSettings(DEFAULT_SETTINGS);
}

export async function saveSettings(settings) {
  const clean = sanitizeSettings(settings);
  try {
    if (typeof browser !== "undefined" && browser?.storage?.local?.set) {
      await browser.storage.local.set({ [STORAGE_KEY]: clean });
      return clean;
    }
  } catch {
    /* weiter zum localStorage-Fallback */
  }
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
  }
  return clean;
}
