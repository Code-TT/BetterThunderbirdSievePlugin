#!/usr/bin/env python3
"""Verifiziert, dass sieve-filter-view im TB-Profil aktiv registriert ist (read-only)."""
import json
import sys

PROFILE = "/Volumes/External Disk/Users/thomas/Library/Thunderbird/Profiles/dkmz3vps.IETimport"
d = json.load(open(f"{PROFILE}/extensions.json"))
found = None
for a in d.get("addons", []):
    if a.get("id") == "sieve-filter-view@trella.de":
        found = a
        break
if not found:
    print("NOT REGISTERED")
    sys.exit(1)
print(
    found["id"],
    "version=" + str(found.get("version")),
    "active=" + str(found.get("active")),
    "visible=" + str(found.get("visible")),
    "userDisabled=" + str(found.get("userDisabled")),
    "appDisabled=" + str(found.get("appDisabled")),
    "location=" + str(found.get("location")),
)
