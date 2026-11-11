#!/usr/bin/env python3
"""Erzeugt addon/data/sieve-dump.json aus einem Sieve-Backup-Skript.

PoC-Datenquelle für Phase 1 (read-only). Usage:
    python3 tools/make_sieve_dump.py backup/sieve-sogo-2026-11-06.txt \
        --script-name sogo --active > addon/data/sieve-dump.json
"""
import argparse
import json
import re
import sys

BLOCK_RE = re.compile(
    r'if\s+(allof|anyof)\s*\((.*?)\)\s*\{\s*(fileinto)\s+"([^"]+)";\s*\}',
    re.S,
)
ADDR_RE = re.compile(r'address\s+:(\w+)\s+"([^"]+)"\s+"([^"]+)"')


def parse(text: str) -> list:
    rules = []
    for i, m in enumerate(BLOCK_RE.finditer(text), 1):
        combinator, cond_src, action, target = m.groups()
        conditions = []
        for op, field, value in ADDR_RE.findall(cond_src):
            conditions.append({"field": field, "op": op, "value": value})
        if not conditions:
            continue
        name = conditions[0]["value"]
        if len(conditions) > 1:
            name += f" (+{len(conditions) - 1})"
        rules.append(
            {
                "id": f"sogo:{i}",
                "scriptName": "sogo",
                "name": name,
                "summary": f"from {conditions[0]['op']} → fileinto {target}",
                "active": None,  # wird per --active gesetzt
                "combinator": combinator,
                "conditions": conditions,
                "action": {"type": action, "target": target},
            }
        )
    return rules


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("backup_file")
    ap.add_argument("--script-name", default="sogo")
    ap.add_argument("--active", action="store_true")
    args = ap.parse_args()

    text = open(args.backup_file, encoding="utf-8").read()
    rules = parse(text)
    for r in rules:
        r["active"] = args.active
        r["scriptName"] = args.script_name

    out = {"scripts": {args.script_name: text}, "rules": rules}
    json.dump(out, sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
