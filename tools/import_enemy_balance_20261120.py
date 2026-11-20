#!/usr/bin/env python3
"""Import the approved 2026-11-20 enemy balance attachment without altering game logic.

Usage:
  python tools/import_enemy_balance_20261120.py /path/to/Maple_Enemy_Balance_20261120.json

Writes content/balance/enemy-balance-20261120.json and a count-only manifest.
Does not edit enemy IDs, field placements, live Lua damage calculation or Sites.
"""
import argparse
import hashlib
import json
import shutil
from pathlib import Path

def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("source", type=Path)
    ap.add_argument("--output", type=Path, default=Path("content/balance/enemy-balance-20261120.json"))
    args = ap.parse_args()
    source = args.source.resolve()
    if not source.is_file():
        ap.error(f"Source not found: {source}")
    with source.open(encoding="utf-8") as f:
        data = json.load(f)
    expected = {"enemy_variants": 1126, "attack_components": 4091, "level_baselines": 200}
    counts = {key: len(data[key]) for key in expected}
    if counts != expected:
        raise SystemExit(f"Unexpected counts {counts}; expected {expected}. Refusing import.")
    enemy_ids = {str(x.get("敵ID", x.get("enemy_id", ""))) for x in data["enemy_variants"]}
    if not any(enemy_ids):
        raise SystemExit("Missing enemy IDs; refusing import.")
    digest = hashlib.sha256(source.read_bytes()).hexdigest()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    if args.output.resolve() != source:
        shutil.copyfile(source, args.output)
    manifest = {
        "status": "design-proposal-not-live",
        "source": source.name,
        "sha256": digest,
        "enemy_id_count": len(enemy_ids),
        "counts": counts,
        "constraints": [
            "Lv cap 200", "shared party EXP", "no boss HP scaling by player count",
            "unverified Miliastra runtime", "do not overwrite existing spawn or skill behavior"
        ]
    }
    out = args.output.with_suffix(".manifest.json")
    out.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Validated {counts}, {len(enemy_ids)} IDs, SHA256 {digest}")
    print(f"Wrote {args.output} and {out}; commit both only after diff review.")

if __name__ == "__main__":
    main()
