# AGENTS.md — Arbeitsregeln für alle Agents an diesem Projekt

**Gültig für jede Agent-Instanz, die hier arbeitet. Bei Session-Start zuerst lesen.**

## Kontext

- Ziel: Sieve-Integration in Thunderbird/Betterbird-Filter-UI. Details: `README.md`, `docs/PROJEKT.md`.
- Orchestrator: Hermes (Default-Agent). Er zerlegt Arbeit in Kanban-Karten und dispatcht Sub-Agents.
- Workdir: `/Volumes/External Disk/Users/thomas/Documents/Development/005_ThunderbirdSieve`
- GitHub: `BetterThunderbirdSievePlugin` (public). **Eine Aufgabe ist erst fertig, wenn committed.**

## Freigaben (von Thomas, 2026-11-06 erteilt — GÜLTIG)

### Betterbird (Desktop-App)
- Plugins installieren/deaktivieren/deinstallieren (inkl. Sieve Reloaded, Quick Filters, Test-Add-ons)
- Settings ändern, soweit für die Entwicklung nötig — **ohne Rückfrage**

### Mail-Account `thomas@trella.de` (Mailserver mail.trellix.de, Sieve-Port 4190, TLS)
- Sieve-Regeln lesen UND schreiben (aktive Skripte inklusive; Auswirkung auf Zustellung gilt als unkritisch)
- Ordner anlegen/löschen, Test-Mails hineinkopieren
- Im Posteingang: Newsletter/Umzugs-/Umfrage-/Werbemails filtern, taggen, verschieben — **aber nichts löschen**
- Mails von/zu aliexpress: frei anfassbar, auch löschen
- **Nie:** andere Accounts anfassen; Account-Einstellungen löschen; Daten außerhalb des Projekts verändern

### Mail-Account `admin@trellix.de`
- Mails zum Testen reinkopieren und wieder löschen — mehr nicht

### Zugangsdaten
- `thomas@trella.de`: Desktop-Datei `.trella-mail` (Pfad: `/Volumes/External Disk/Users/thomas/Desktop/.trella-mail`)
- **Niemals** Zugangsdaten in Git, Logs oder Doku ablegen. `.trella-mail` nie kopieren oder committen.
- Bestehende Sieve-Skripte: getestet mit `managesieve`-Python-Lib (siehe `docs/notizen-managesieve.md`).

## Sicherheitsregeln (nicht verhandelbar)

1. **Backup vor Änderung**: Vor dem ersten Schreiben aufs Server-Sieve gilt `backup/` als Restore-Quelle.
   Am Ende einer Arbeitsphase: aktuelles Skript nach `backup/` exportieren und Bestand „sogo" wiederherstellen,
   falls währenddessen deaktiviert/verändert.
2. **Niemals destruktiv ohne Doppel-Check** (Löschen von Ordnern, Überschreiben von Skripten).
3. Im Zweifel: stehen bleiben und Orchestrator/User fragen.
4. Passwörter nur über die Desktop-Datei ODER den TB-Login-Manager beziehen — nie hardcoden, nie loggen.

## Teststrategie

- UI (Editor/Popups/Filterliste-Darstellung): HTML → **Playwright** in Chromium (deterministisch)
- TB-Glue (Injektion, Kontextmenü): manuelle Screenshot-Verifikation via Computer-Use (entsperrter Desktop nötig)
- Server-Roundtrip: `managesieve`-Lib gegen mail.trellix.de (Upload inaktives Testskript → LISTSCRIPTS → DELETE)

## Kanban

Arbeit wird über Kanban verteilt. Jede Karte: klarer Scope + Definition of Done + Issue-Verweis.
Orchestrator verwaltet Board; Worker lesen nur ihre Karte + AGENTS.md + relevante docs/.
