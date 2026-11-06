#!/usr/bin/env python3
"""Zeigt disableReasons/startupData des sieve-filter-view-Eintrags."""
import json

path = "/Volumes/External Disk/Users/thomas/Library/Thunderbird/Profiles/dkmz3vps.IETimport/extensions.json"
d = json.load(open(path))
a = next(x for x in d["addons"] if x["id"] == "sieve-filter-view@trella.de")
print("keys:", sorted(a.keys()))
print("disableReasons:", a.get("disableReasons"))
for k in ("embedderDisabled", "hidden", "incognito", "recommendationState",
          "blocklistState", "requestedPermissions", "userPermissions",
          "targetApplications", "strictCompatibility"):
    print(k, "=", a.get(k))
print("startupData:", a.get("startupData"))
sd = a.get("startupData")
if isinstance(sd, dict):
    print("startupData keys:", sorted(sd.keys()))
    for k in ("experimentalAPIs", "experimentAPIs", "isExperiment"):
        if k in sd:
            print(k, "=", sd[k])
