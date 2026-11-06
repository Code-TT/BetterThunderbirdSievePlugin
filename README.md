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

## Status

Siehe `docs/PROJEKT.md` (Plan, Phasen) und `AGENTS.md` (Arbeitsregeln & Freigaben).
