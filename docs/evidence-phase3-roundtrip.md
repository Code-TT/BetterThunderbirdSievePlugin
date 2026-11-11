# Evidence — Phase-3-Live-Roundtrip gegen mail.trellix.de (2026-11-11, Proxy 6fca4cb, Port 9441)

=== STATUS
{"account_host":"mail.trellix.de","account_login":"thomas@trella.de","account_port":4190,"creds_available":true,"ok":true,"platform":"darwin"}

=== SCRIPTS (Lesen; sogo aktiv, Byte-identisch mit Backup fp 75c551c36d14…)
{"active":"sogo","scripts":[{"active":true,"fingerprint":"75c551c36d142c839faea1c293b711d53857c3c2f105feabb867bd717ac0b7aa","name":"sogo"}],"server":"mail.trellix.de:4190"}

=== 1 PUT testphase3 (inaktiv, Testskript) → 200 {"fingerprint":"93f42cbced3e9f70c7565ab945c4438115ca21754ee0641b91739db675b5bac1"}
=== 2 GET testphase3 → fingerprint 93f42cbced3e… (identisch zum PUT)
=== 3 PUT modify mit if_unchanged=93f42… → 200 {"fingerprint":"6be93983062b179339676063856ba0e77c407b5b22d0fb7fa39cf014246b1a34"}
=== 4 PUT modify mit ALTEM if_unchanged → [http 409] {"error":"conflict: Skript wurde seit dem Lesen geändert","currentFingerprint":"6be93983…"}
=== 5 DELETE ohne confirm → [http 400] {"error":"Doppel-Check fehlt: confirm=1 erforderlich"}
=== 6 DELETE confirm=1&if_unchanged=6be93983… → [http 200] {"deleted":"testphase3"}
=== 7 PUT ungültiges Sieve → [http 400] {"error":"PUTSCRIPT abgelehnt: …"} (keine stillen Fehler)
=== 8 SOGO danach unverändert: aktiv, fp 75c551c36d142c839faea1c293b711d53857c3c2f105feabb867bd717ac0b7aa

=== Config-Endpunkt
GET /config → {"accounts":[{"host":"mail.trellix.de","port":4190,"login":"thomas@trella.de","use_tls":true}],"http_port":9421,"autostart":…}
PUT /config {"autostart":true} → LaunchAgent ~/Library/LaunchAgents/de.trellix.sieveproxy.plist (plutil: OK)

=== Autostart-Roundtrip (macOS)
install → launchctl list: "57047 0 de.trellix.sieveproxy"; Proxy lauscht 127.0.0.1:9421; GET /status → {"ok":true,...}
remove → plist gelöscht, launchctl-Eintrag weg

=== Build/Tests
go build ./... OK · go vet OK · go build -tags systray OK · go test ./... ok (Fingerprint-Interop, Cred-Indizes 3/4, Config-Roundtrip)
Tray-Smoke: sieveproxy -tray startet, läuft 4 s, kein Crash (exit 124 = timeout-kill)
Cross-Compile: .github/workflows/proxy-build.yml (darwin arm64/amd64+tray, windows amd64+tray, linux amd64/arm64 headless; Release bei Tag sieveproxy-v*)

- CI proxy-build: success (5 Targets: darwin arm64/amd64+tray, windows amd64+tray, linux amd64/arm64; Run 42966446761, Commit 1029e09)
