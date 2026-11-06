#!/usr/bin/env python3
"""Zeigt den vollständigen extensions.json-Eintrag für sieve-filter-view."""
import json

PROFILE = "/Volumes/External Disk/Users/thomas/Library/Thunderbird/Profiles/dkmz3vps.IETimport"
d = json.load(open(f"{PROFILE}/extensions.json"))
for a in d.get("addons", []):
    if a.get("id") == "sieve-filter-view@trella.de":
        for k in ("active", "visible", "userDisabled", "appDisabled", "softDisabled",
                  "pendingUninstall", "signedState", "signedDate", "signedTypes",
                  "disabledPendingInstall", "path", "installTelemetryInfo", "seen"):
            print(k, "=", a.get(k))
