# Sieve Proxy (Phase 3, Go)

Lokaler Bridge-Proxy zwischen dem Thunderbird/Betterbird-Add-on und dem
ManageSieve-Server (`mail.trellix.de:4190`). Implementiert exakt die API der
Phase-2-Testbridge (`tools/sieve_bridge.py`) plus Config-/Status-Endpunkt.

## Start

```
cd proxy
go build -tags systray -o dist/sieveproxy .        # mit Systray (macOS/Windows)
./dist/sieveproxy -port 9421 -tray                 # HTTP + Systray-Icon
./dist/sieveproxy -port 9421                       # headless
./dist/sieveproxy install-autostart                # LaunchAgent (mac) / HKCU Run (win) / .desktop (linux)
./dist/sieveproxy remove-autostart
```

Nur `127.0.0.1` — nie an externen Interfaces lauschen.

## Endpunkte

| Methode | Pfad | Verhalten (identisch Phase 2) |
|---|---|---|
| GET | `/scripts` | Liste `{name, active, fingerprint}` + `active` + `server` |
| GET | `/script/<name>` | `{name, active, fingerprint, text}`; 404 wenn fehlt |
| PUT | `/script/<name>` | Body `{text, if_unchanged?}` → 200 `{fingerprint}` \| 409 Konflikt \| 400 abgelehnt |
| DELETE | `/script/<name>?confirm=1&if_unchanged=…` | 400 ohne `confirm=1`; 409 wenn aktiv; 409 Konflikt |
| POST | `/script/<name>/activate` | SETACTIVE |
| POST | `/deactivate` | 403 wenn `sogo` aktiv (Restore-Pfad, wie Phase 2) |
| GET | `/config` | Konten-Konfig + `autostart`-Flag (keine Passwörter) |
| PUT | `/config` | `{accounts?, autostart?}` setzen; autostart installiert/entfernt LaunchAgent |
| GET | `/status` | lokaler Zustand (Port, Konto, Creds verfügbar) ohne Serverzugriff |

Fingerprint: `sha256("<True|False>\x00<text>")` — Byte-identisch zur
Python-Testbridge (Unit-Test `TestFingerprintMatchesPythonBridge`).

## Credentials

Niemals geloggt, nie in der Config-Datei. Gelesen aus `~/Desktop/.trella-mail`,
Index 3 = Login, Index 4 = Passwort (Off-by-one-Fix 8a18b0f — Zeile 2 ist leer).
Der `/config`-Endpunkt akzeptiert bewusst kein Passwort (AGENTS.md).

## Protokoll

ManageSieve (RFC 5804) über STARTTLS: Plaintext-Greeting → `STARTTLS` →
TLS-Handshake → `AUTHENTICATE "PLAIN"`. Besonderheiten Dovecot: nach
AUTHENTICATE kommen ein Capability-Refrain UND mehrere OK-Zeilen — der Client
drainiert diese mit kurzer Read-Deadline + NOOP, bevor das nächste Kommando
gelesen wird. Zertifikatsprüfung aus (selbstsigniertes Intranet-Zertifikat,
gleiche Vertrauensbasis wie die Phase-2-Testbridge).

## Build-Tags

- ohne Tags: headless (Server-/CI-Build, keine GUI-Abhängigkeit)
- `-tags systray`: getlantern/systray (macOS via cgo → macOS-Runner in CI;
  Windows pure Go; Linux ohne Tray, GTK-cgo bewusst nicht im CI)

## Cross-Compile

`.github/workflows/proxy-build.yml` baut darwin/arm64+amd64 (mit Tray),
windows/amd64 (mit Tray), linux/amd64+arm64 (headless) und lädt Artefakte
hoch; Tags `sieveproxy-v*` erzeugen ein GitHub-Release.

## Getestet (2026-11-11, gegen mail.trellix.de)

- `go test ./...`: Fingerprint-Interop, quote/literal-Parsing, Cred-Indizes,
  Config-Roundtrip
- Live-Roundtrip (Phase-2-Muster): PUT → GET → modify(if_unchanged) →
  409 mit altem Fingerprint → DELETE ohne confirm=400 → DELETE mit
  confirm=1 → 200; `sogo` blieb aktiv und Byte-identisch
  (fp `75c551c36d14…`)
- Autostart-Roundtrip am Mac: LaunchAgent installiert → `launchctl list`
  zeigt `de.trellix.sieveproxy` → Proxy lauscht auf 9421 und `/status`
  antwortet → entfernen räumt auf
- Ungültiges Sieve → PUTSCRIPT 400 (keine stillen Fehler)
