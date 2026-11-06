# Projektplan — BetterThunderbirdSievePlugin

## Phase 0 — Setup (abgeschlossen 2026-11-06)
- [x] Workdir + Repo angelegt
- [x] Sieve-Bestand gesichert: `backup/sieve-sogo-2026-11-06.txt` (Skript „sogo", aktiv, 1937 Zeichen,
      fileinto-Regeln für AliExpress/DHgate/Facebook/Banggood/Temu/Xing/Werbung-Domains)
- [x] ManageSieve-Zugang verifiziert (mail.trellix.de:4190 TLS, Login OK)

## Phase 1 — PoC: Sieve-Regeln in der Filterliste anzeigen (read-only)
- [ ] Add-on-Skeleton (WebExtension + Experiment-API), Build-Pipeline
- [ ] Injektion in das Filter-Listen-Fenster: Sieve-Regeln als Zeilen mit Icon
- [ ] Umschalter: alle / nur lokal / nur Sieve
- [ ] Klick auf Sieve-Zeile → Viewer (read-only), im TB-Fensterstil
- [ ] Verifikation: Screenshots (Computer-Use) + Playwright für den Viewer

## Phase 2 — Editierbarkeit
- [ ] Sieve-Parser/Serializer (parser-Basis von Sieve Reloaded wiederverwenden)
- [ ] Editor-Dialog im TB-Look (eigenes HTML-Popup)
- [ ] Write-Back via Proxy, Konflikt-Erkennung (ETag/„geändert seit Lesen")
- [ ] Aktive/inaktive Skripte verwalten

## Phase 3 — Proxy & Verteilung
- [ ] Go-Proxy: localhost-HTTP/WebSocket → ManageSieve, Systray (3 Plattformen, getlantern/systray)
- [ ] Config-Endpunkt (Add-on schreibt Konten-Konfig; Passwort via TB-Login-Manager)
- [ ] Autostart: LaunchAgent (mac) / HKCU Run (win) / .desktop (linux), Toggle in Add-on-Settings
- [ ] Cross-Compile via GitHub Actions

## Phase 4 — Rechtsklick-Flow
- [ ] Kontextmenü: Filter nach Absender / Domain / Betreff-Wort / Kombination
- [ ] Popup mit Vorbefüllung; Aktion wählbar: Serverregel (Sieve, fileinto/redirect) ODER
      lokale Regel (Taggen etc. — Tags sind NIEMALS als Serverregel umsetzbar, nur lokal)
- [ ] Anlehnung an Email-Cleanup-Utilities-Vokabular (Trash/Junk-Optionen mit Vorsichts-Hinweisen)

## Offene Punkte / Entscheidungen
- Distribution ohne Dev-Accounts: Mac xattr-Hinweis, Win SmartScreen-Warnung — für Test ok,
  für Release Jan 2027 Apple Developer + Win-Codesigning klären
- Namens-/Branding-Frage für das Add-on offen
