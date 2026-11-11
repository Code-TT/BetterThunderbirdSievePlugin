# BetterThunderbirdSievePlugin

Sieve-Mail-Filterung für Thunderbird/Betterbird — so integriert, dass sich Server-Regeln (Sieve)
wie die eingebauten lokalen Filter anfühlen.

## Ziel

Ein Mail-Postfach automatisch sortieren: wichtige Nachrichten taggen, Schrott in Ordner.
Thunderbirds lokale Filter laufen nur, wenn TB läuft — **Sieve-Regeln laufen auf dem Mailserver**
(Dovecot & Co.) und sortieren schon bei der Zustellung. Dieses Projekt macht Sieve komfortabel:

1. **Sieve-Regeln in der bekannten Filter-UI**: In Thunderbords Filter-Liste erscheinen Sieve-Regeln
   mit eigenem Icon, lokale und Server-Filter sind unterscheidbar und filterbar.
2. **Rechtsklick → Filter erstellen**: Aus einer markierten Mail per Kontextmenü einen Filter
   bauen (Absender / Domain / Betreff-Wort / Kombination) — Popup öffnet sich vorbefüllt.
3. **Sieve-Editor im Thunderbird-Look**: Statt der „hässlichen Website" von Sieve Reloaded
   ein eigener, aufgeräumter Editor-Dialog (eigenes HTML-Popup — testbar mit Playwright).
4. **Proxy ohne Frust**: Ein kleines, plattformübergreifendes Proxy-Programm (Go) mit Systray-Icon
   ersetzt die komplizierte Native-Messaging-Bridge. Konfiguration (Server/Port/User/Passwort)
   erfolgt im Add-on, nicht am Proxy.

## Architektur (Kurzform)

```
Thunderbird/Betterbird                    Mailserver (Dovecot)
┌──────────────────────────┐             ┌──────────────────┐
│  Add-on (WebExtension    │   HTTP/WS   │  Proxy (Go)      │  ManageSieve
│  + Experiment-API)  ─────┼────────────►│  localhost-HTTP  ├────────────► :4190
│  UI: Filter-Liste-Injekt,│  (localhost)│  Systray, Config │  (TLS)
│  Popups, Context-Menü    │             │  (aus Add-on)    │
└──────────────────────────┘             └──────────────────┘
```

- Add-on darf keine rohen TCP-Sockets öffnen → Proxy überbrückt das (localhost HTTP/WebSocket).
- Alternativ (Option, Mailcow-Admins): Server-seitiger HTTP-Proxy statt lokalem Programm.
- UI-Testbarkeit: Editor/Popups sind eigenes HTML → Playwright-Tests; nur die Injektion
  ins TB-Fenster braucht manuelle Verifikation (Screenshots via Computer-Use).

## Repos & Layout

- GitHub: `BetterThunderbirdSievePlugin` (public)
- Dieses Verzeichnis = Repo-Root; `proxy/` (Go), `addon/` (WebExtension), `tests/` (Playwright)

## Installation

### 1. Proxy herunterladen

Die Plattform-Binaries (Windows/Linux/macOS) werden von [GitHub Actions Cross-Compile](https://github.com/Code-TT/BetterThunderbirdSievePlugin/blob/main/.github/workflows/proxy-release.yml)
gebaut und als Artefakte im
[Release 0.1.0](https://github.com/Code-TT/BetterThunderbirdSievePlugin/releases/tag/sieveproxy-v0.1.0)
veröffentlicht:

```
sieveproxy-darwin-arm64      sieveproxy-windows-amd64.exe
sieveproxy-darwin-amd64      sieveproxy-linux-amd64
                             sieveproxy-linux-arm64
```

**macOS:** Der Binary ist unsigniert — beim ersten Start via Rechtsklick → Öffnen einmal erlauben,
oder `xattr -c sieveproxy-*` setzen.
**Windows:** SmartScreen-Warnung erscheint bei eigener Signierung; „Weitere Informationen" → Ausführen.

Der Proxy startet ein Systray-Icon und lauscht auf localhost-HTTP für das Add-on. Autostart wird vom
Add-on eingerichtet (Phase-4-Funktion).

### 2. Sieve-Konfiguration

Zielserver: `mail.trellix.de`, ManageSieve auf Port **4190**, TLS aktiviert.

Die Zugangsdaten werden vom Add-on in der Desktop-Homedatei `.trella-mail` gelesen bzw. verwaltet:
der Proxy braucht sie nicht aus dem Repo zu wissen, das Passwort wird nur hier lokal abgelegt und
niemals ins Repository übergeben, geloggt oder committed (siehe
[docs/notizen-managesieve.md](docs/notizen-managesieve.md)):

> ⚠️ **Niemals Credentials im Code / in Commits speichern!**

### 3. Add-on in Betterbird installieren

Das Add-on (`.xpi`) wird von `npm run build` lokal gebaut (tools/build_xpi.mjs → dist/sieve-filter-view-<version>.xpi).
Für die Entwicklung wird es in Betterbird als temporäres Add-on geladen:

```
Betterbird → Add-ons → Zahnrad → "Add-on aus Datei installieren" → sieve-filter-view-0.2.0.xpi
```

Die Signierung/XPInstall in Betterbird: `xpinstall.signatures.required` muss in
`about:config` auf **false** gesetzt sein (Standard bei Betterbird-Builds), damit die
XPI-Datei (nicht aus dem Add-on-Store) installiert werden kann.

## Status

Siehe `docs/PROJEKT.md` (Plan, Phasen) und `AGENTS.md` (Arbeitsregeln & Freigaben).
