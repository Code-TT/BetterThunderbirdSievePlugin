#!/usr/bin/env python3
"""Aktiviert sieve-filter-view im TB-Profil (userDisabled=False) — TB muss geschlossen sein."""
import json
import sys

PROFILE = "/Volumes/External Disk/Users/thomas/Library/Thunderbird/Profiles/dkmz3vps.IETimport"
path = f"{PROFILE}/extensions.json"
d = json.load(open(path))
hit = False
for a in d.get("addons", []):
    if a.get("id") == "sieve-filter-view@trella.de":
        a["userDisabled"] = False
        a["softDisabled"] = False
        hit = True
if not hit:
    sys.exit("extension not found")
json.dump(d, open(path, "w"))
print("enabled")
