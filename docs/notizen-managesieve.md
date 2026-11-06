# Notizen: ManageSieve-Zugang (praktisch erprobt)

- Python-Lib: `managesieve` (pip, alt aber funktional) im Projekt-Venv `.venv`
- Login-Signatur: `s.login(auth, user, password)` → `s.login("thomas@trella.de", "thomas@trella.de", pw)`
- TLS: `MANAGESIEVE(host, port=4190, use_tls=True)`
- `listscripts()` → `(OK, [("sogo", True)])` — True = aktiv
- `getscript(name)` → `(OK, script_text)` (2-Tuple in dieser Lib-Version!)
- Server: Dovecot/Pigeonhole-Verhalten, Skript „sogo" aktiv (Stand 2026-11-06)
- Passwort: Desktop-Datei `.trella-mail` — nie loggen/committen
