/* SieveClient — Abstraktion der Write-Back-Schicht.
 * Phase 2: Implementierung gegen die Python-Testbridge (tools/sieve_bridge.py,
 * localhost-HTTP). Phase 3: Der Go-Proxy implementiert exakt dieselben Endpunkte,
 * sodass diese Klasse unverändert weiterläuft.
 *
 * Endpunkt-Vertrag (vom Go-Proxy zu übernehmen):
 *   GET    /scripts                       → { scripts: [{name, active, fingerprint}], active }
 *   GET    /script/<name>                 → { name, active, fingerprint, text }
 *   PUT    /script/<name>                 ← { text, if_unchanged? } → 200 { fingerprint } | 409 { error }
 *   DELETE /script/<name>?confirm=1[&if_unchanged=fp] → 200 | 400 | 404 | 409
 *   POST   /script/<name>/activate        → 200
 *   POST   /deactivate                    → 200
 */
"use strict";

export class SieveConflictError extends Error {
  constructor(message, details) {
    super(message);
    this.name = "SieveConflictError";
    this.details = details || {};
  }
}

/** Netzwerkfehler (Proxy nicht erreichbar etc.) — klare Nutzerbotschaft statt rohem fetch-Fehler. */
export class SieveConnectionError extends Error {
  constructor(message, details) {
    super(message);
    this.name = "SieveConnectionError";
    this.details = details || {};
  }
}

export class SieveClient {
  /**
   * @param {object} opts
   * @param {string} [opts.baseUrl]  Basis-URL des (Test-)Proxys, default 127.0.0.1:9421
   * @param {typeof fetch} [opts.fetchImpl] injizierbar für Tests
   */
  constructor({ baseUrl = "http://127.0.0.1:9421", fetchImpl = globalThis.fetch } = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    const raw = fetchImpl;
    this._fetch = async (url, init) => {
      try {
        return await raw(url, init);
      } catch (e) {
        throw new SieveConnectionError(
          `Sieve-Proxy unter ${this.baseUrl} nicht erreichbar. Läuft der Proxy?`,
          { baseUrl: this.baseUrl, cause: String((e && e.message) || e) }
        );
      }
    };
  }

  async listScripts() {
    const r = await this._fetch(`${this.baseUrl}/scripts`);
    if (!r.ok) throw new Error(`LISTSCRIPTS fehlgeschlagen: HTTP ${r.status}`);
    return r.json();
  }

  async getScript(name) {
    const r = await this._fetch(`${this.baseUrl}/script/${encodeURIComponent(name)}`);
    if (!r.ok) throw new Error(`GETSCRIPT '${name}' fehlgeschlagen: HTTP ${r.status}`);
    return r.json(); // { name, active, fingerprint, text }
  }

  /** PUTSCRIPT mit Konflikt-Check. Wirft SieveConflictError bei 409 (kein stilles Überschreiben). */
  async putScript(name, text, { ifUnchanged } = {}) {
    const body = { text };
    if (ifUnchanged) body.if_unchanged = ifUnchanged;
    const r = await this._fetch(`${this.baseUrl}/script/${encodeURIComponent(name)}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (r.status === 409) {
      const err = await r.json().catch(() => ({}));
      throw new SieveConflictError(err.error || "Konflikt: Skript wurde zwischenzeitlich geändert.", err);
    }
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error(err.error || `PUTSCRIPT fehlgeschlagen: HTTP ${r.status}`);
    }
    return r.json(); // { fingerprint }
  }

  /** DELETESCRIPT — Doppel-Check verpflichtend (confirm=1), Konflikt-Check optional. */
  async deleteScript(name, { fingerprint, confirm = false } = {}) {
    if (!confirm) throw new Error("deleteScript verlangt confirm=true (Doppel-Check)");
    const params = new URLSearchParams({ confirm: "1" });
    if (fingerprint) params.set("if_unchanged", fingerprint);
    const r = await this._fetch(`${this.baseUrl}/script/${encodeURIComponent(name)}?${params}`, { method: "DELETE" });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      if (r.status === 409) throw new SieveConflictError(err.error || "Konflikt beim Löschen.", err);
      throw new Error(err.error || `DELETE fehlgeschlagen: HTTP ${r.status}`);
    }
    return r.json();
  }

  async setActive(name) {
    const r = await this._fetch(`${this.baseUrl}/script/${encodeURIComponent(name)}/activate`, { method: "POST" });
    if (!r.ok) throw new Error(`SETACTIVE '${name}' fehlgeschlagen: HTTP ${r.status}`);
    return r.json();
  }

  async deactivate() {
    const r = await this._fetch(`${this.baseUrl}/deactivate`, { method: "POST" });
    if (!r.ok) throw new Error(`SETACTIVE '' fehlgeschlagen: HTTP ${r.status}`);
    return r.json();
  }
}
