#!/usr/bin/env python3
"""Installiert/aktiviert sieve-filter-view.xpi über Marionette (TB --marionette, Port 2828).

Versucht mehrere Marionette-Kommandovarianten und liest die Antworten; read-only
bezüglich Mail-Daten — installiert nur das Projekt-Addon temporär (temporary=True).
"""
import json
import socket
import sys

XPI = "/Volumes/External Disk/Users/thomas/Documents/Development/005_ThunderbirdSieve/dist/sieve-filter-view-0.1.0.xpi"
HOST, PORT = "127.0.0.1", 2828


def send(s, msg_id, command, params):
    payload = json.dumps([msg_id, command, params])
    s.sendall(f"{len(payload)}:{payload}".encode())
    # Antwort: Länge:JSON-Pakete lesen
    buf = b""
    while True:
        chunk = s.recv(65536)
        if not chunk:
            raise EOFError("marionette closed")
        buf += chunk
        if b":" in buf:
            head, rest = buf.split(b":", 1)
            n = int(head)
            if len(rest) >= n:
                return json.loads(rest[:n])
            buf = head + b":" + rest  # mehr lesen


s = socket.create_connection((HOST, PORT), timeout=15)
s.settimeout(3)
# Willkommen lesen: Länge:JSON-Paket (ohne festes Zeilenende).
buf = b""
welcome = None
try:
    while welcome is None:
        chunk = s.recv(65536)
        if not chunk:
            break
        buf += chunk
        if b":" in buf:
            head, rest = buf.split(b":", 1)
            n = int(head)
            if len(rest) >= n:
                welcome = json.loads(rest[:n])
                buf = rest[n:]
except (socket.timeout, ValueError) as e:
    print("welcome read issue:", e)
print("welcome:", welcome)

variants = [
    ("addon", {"command": "install", "path": XPI, "temporary": True}),
    ("Addon.install", {"path": XPI, "temporary": True}),
    ("addon:install", {"path": XPI, "temporary": True}),
    ("AddonManager.install", {"path": XPI, "temporary": True}),
]
for i, (cmd, params) in enumerate(variants, 1):
    try:
        resp = send(s, i, cmd, params)
        print(f"{cmd} ->", json.dumps(resp)[:500])
        # Erfolg: [1, <result>, null]
        if resp[1] is not None and resp[2] is None:
            print("SUCCESS via", cmd)
            sys.exit(0)
    except Exception as e:
        print(f"{cmd} -> error: {e}")
sys.exit(1)
