#!/usr/bin/env python3
"""Testbridge Phase 2: localhost-HTTP → ManageSieve (mail.trellix.de:4190 TLS).

Implementiert genau die Schnittstelle, die der Go-Proxy in Phase 3 1:1 übernimmt.
Läuft NUR auf 127.0.0.1. Zugangsdaten werden zur Laufzeit aus der Desktop-Datei
`.trella-mail` gelesen (positional: Zeile 3 = Login, Zeile 4 = Passwort) und nie
geloggt. Konflikt-Erkennung: Fingerprint (SHA-256 über Skripttext + Aktiv-Status);
PUT/DELETE mit `if_unchanged` prüfen vor dem Write.

Endpunkte:
  GET    /scripts                  → {"scripts": [{name, active, fingerprint}], "active": ...}
  GET    /script/<name>            → {"name", "active", "fingerprint", "text"}
  PUT    /script/<name>            → body {"text", "if_unchanged"?} → 200 {"fingerprint"} | 409
  DELETE /script/<name>?confirm=1  → 200 | 409 (Konflikt) | 400 (fehlender Doppel-Check)
  POST   /script/<name>/activate   → 200
  POST   /deactivate               → 200 (SETACTIVE "")

Usage: python3 tools/sieve_bridge.py [port]   (Default 9421)
"""
import hashlib
import json
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs

import managesieve

CRED_FILE = Path.home() / "Desktop" / ".trella-mail"
HOST = "mail.trellix.de"
PORT = 4190


def load_creds():
    lines = CRED_FILE.read_text(encoding="utf-8").splitlines()
    return lines[2].strip(), lines[3].strip()


def connect():
    user, pw = load_creds()
    s = managesieve.MANAGESIEVE(HOST, port=PORT, use_tls=True)
    ok, msg = s.login("thomas@trella.de", user, pw)
    if not ok:
        raise RuntimeError("ManageSieve-Login fehlgeschlagen")
    return s


def fingerprint(text, active):
    return hashlib.sha256((f"{active}\x00{text}").encode("utf-8")).hexdigest()


class Bridge(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):  # keine Query-Parameter loggen (könnten Namen enthalten)
        sys.stderr.write("bridge: %s %s\n" % (self.command, urlparse(self.path).path))

    def _json(self, code, obj):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(code)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_body(self):
        length = int(self.headers.get("content-length", 0))
        return json.loads(self.rfile.read(length).decode("utf-8")) if length else {}

    def do_GET(self):
        url = urlparse(self.path)
        s = None
        try:
            s = connect()
            if url.path == "/scripts":
                ok, scripts = s.listscripts()
                if not ok:
                    return self._json(502, {"error": str(scripts)})
                out = []
                active = None
                for item in scripts or []:
                    name, active_flag = item
                    ok2, text = s.getscript(name)
                    if not ok2:
                        return self._json(502, {"error": str(text)})
                    out.append({"name": name, "active": bool(active_flag), "fingerprint": fingerprint(text, bool(active_flag))})
                    if active_flag:
                        active = name
                return self._json(200, {"scripts": out, "active": active, "server": f"{HOST}:{PORT}"})
            if url.path.startswith("/script/"):
                name = url.path[len("/script/"):]
                ok, text = s.getscript(name)
                if not ok:
                    return self._json(404, {"error": str(text)})
                ok3, scripts = s.listscripts()
                active = any(name == i[0] and i[1] for i in (scripts or []))
                return self._json(200, {"name": name, "active": active, "fingerprint": fingerprint(text, active), "text": text})
            return self._json(404, {"error": "not found"})
        finally:
            try:
                if s is not None:
                    s.logout()
            except Exception:
                pass

    def do_PUT(self):
        url = urlparse(self.path)
        if not url.path.startswith("/script/"):
            return self._json(404, {"error": "not found"})
        name = url.path[len("/script/"):]
        body = self._read_body()
        s = None
        try:
            s = connect()
            if "if_unchanged" in body:
                ok, text = s.getscript(name)
                current = text if ok else None
                active = any(name == i[0] and i[1] for i in (s.listscripts()[1] or []))
                if current is not None and fingerprint(current, active) != body["if_unchanged"]:
                    return self._json(409, {"error": "conflict: Skript wurde seit dem Lesen geändert",
                                            "currentFingerprint": fingerprint(current, active)})
            ok, msg = s.putscript(name, body["text"])
            if not ok:
                return self._json(400, {"error": f"PUTSCRIPT abgelehnt: {msg}"})
            ok2, text = s.getscript(name)
            return self._json(200, {"fingerprint": fingerprint(text, any(name == i[0] and i[1] for i in (s.listscripts()[1] or [])))})
        finally:
            try:
                if s is not None:
                    s.logout()
            except Exception:
                pass

    def do_DELETE(self):
        url = urlparse(self.path)
        if not url.path.startswith("/script/"):
            return self._json(404, {"error": "not found"})
        name = url.path[len("/script/"):]
        qs = parse_qs(url.query)
        if qs.get("confirm", [""])[0] != "1":
            return self._json(400, {"error": "Doppel-Check fehlt: confirm=1 erforderlich"})
        if_unchanged = qs.get("if_unchanged", [None])[0]
        s = None
        try:
            s = connect()
            active = any(name == i[0] and i[1] for i in (s.listscripts()[1] or []))
            if active:
                return self._json(409, {"error": "Aktives Skript kann nicht gelöscht werden — erst deaktivieren"})
            ok, text = s.getscript(name)
            if not ok:
                return self._json(404, {"error": str(text)})
            if if_unchanged and fingerprint(text, False) != if_unchanged:
                return self._json(409, {"error": "conflict: Skript wurde seit dem Lesen geändert"})
            ok2, msg = s.deletescript(name)
            if not ok2:
                return self._json(400, {"error": f"DELETESCRIPT abgelehnt: {msg}"})
            return self._json(200, {"deleted": name})
        finally:
            try:
                if s is not None:
                    s.logout()
            except Exception:
                pass

    def do_POST(self):
        url = urlparse(self.path)
        s = None
        try:
            s = connect()
            if url.path == "/script/deactivate" or url.path == "/deactivate":
                # Sicherheits-/Restore-Pfad: Aktivieren von "sogo" immer erlauben,
                # Deaktivieren des aktiven "sogo" nur mit ausdrücklicher Umgebungs-Freigabe.
                ok_l, scripts = s.listscripts()
                active = next((i[0] for i in (scripts or []) if i[1]), None)
                if active == "sogo" and os.environ.get("BRIDGE_ALLOW_SOGO") != "1":
                    return self._json(403, {"error": "sogo ist aktiv — Deaktivieren nur mit BRIDGE_ALLOW_SOGO=1 (Restore-Pfad)"})
                ok, msg = s.setactive("")
                return self._json(200 if ok else 400, {"deactivated": ok, "msg": str(msg)})
            if url.path.startswith("/script/") and url.path.endswith("/activate"):
                name = url.path[len("/script/"):-len("/activate")]
                ok, msg = s.setactive(name)
                return self._json(200 if ok else 400, {"activated": name, "ok": ok, "msg": str(msg)})
            return self._json(404, {"error": "not found"})
        finally:
            try:
                if s is not None:
                    s.logout()
            except Exception:
                pass


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 9421
    print(f"sieve bridge on http://127.0.0.1:{port} (→ {HOST}:{PORT})")
    ThreadingHTTPServer(("127.0.0.1", port), Bridge).serve_forever()
