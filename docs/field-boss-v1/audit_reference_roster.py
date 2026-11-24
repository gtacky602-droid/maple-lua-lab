#!/usr/bin/env python3
"""Read-only, static audit of the fixed 49-encounter field-boss design index.

The 13 manifest formats are normalized by their actual field conventions, not
by schema_version: several incompatible formats all call themselves "1.0".
An attack card's global key is (encounter_id, attack_id). Bare attack IDs are
local labels and already collide between some historical batches.

This checks design documents, not Lua behavior, art, balance, or completion of
the current encounter catalog. It never writes files or changes catalog status.
"""

from __future__ import annotations

import argparse
import copy
import json
import re
from collections import Counter, defaultdict
from pathlib import Path


# filename, encounters, boss ID key, boss card-list key, card owner key,
# declared encounter-count key. None means ownership comes from boss references.
PROFILES = (
    ("MANIFEST_STARTER.json", 4, "encounter_id", "attack_ids", "encounter_id", "bosses"),
    ("MANIFEST_LIYUE_FIELD.json", 3, "encounter_id", "attack_ids", "encounter_id", "bosses"),
    ("MANIFEST_OCEANID_INAZUMA.json", 4, "encounter_id", "attack_ids", "encounter_id", "bosses"),
    ("MANIFEST_HYPOSTASES_WOLFLORD.json", 4, "encounter_id", "attack_ids", "encounter_id", "bosses"),
    ("MANIFEST_DEEP_RUINS.json", 4, "encounter_id", "attack_ids", "encounter_id", "encounters"),
    ("MANIFEST_SUMERU_FIELD.json", 4, "id", "attacks", "owner", "encounters"),
    ("MANIFEST_FONTAINE_FIELD.json", 4, "encounter_id", "attack_ids", "encounter_id", "encounters"),
    ("MANIFEST_DANCE_STONE.json", 4, "encounter_id", "attack_ids", "encounter_id", "encounters"),
    ("MANIFEST_NATLAN_ORIGINS.json", 4, "id", "attacks", "owner", "encounters"),
    ("MANIFEST_NATLAN_REMAINING.json", 3, "id", "attacks", "owner", "encounters"),
    ("MANIFEST_NOD_KRAI_QUARTET.json", 4, "id", "attacks", None, "encounters"),
    ("MANIFEST_RADIANT_VIGIL.json", 3, "id", "attacks", None, "encounters"),
    ("MANIFEST_SNEZHNAYA.json", 4, "id", "attacks", None, "encounters"),
)
EXPECTED_ENCOUNTERS = 49
EXPECTED_CARDS = 147
ROSTER_FILE = "DESIGN_BOSS_ROSTER_REVIEW_20261117.md"
MASTER_FILE = "DESIGN_FIELD_BOSS_MASTER_V01.md"
MANIFEST_DIR = Path("docs/field-boss-v1")
ENCOUNTER_ID = re.compile(r"(?:boss-\d+|icewind-[a-z]+|bathysmal-herd)\Z")
KNOWN_BARE_COLLISIONS = {
    **{f"FV{i:02d}": {"boss-26050101", "boss-24111101"} for i in range(1, 4)},
    **{f"FWN{i:02d}": {"boss-26130101", "boss-22150101"} for i in range(1, 4)},
}


def duplicates(values):
    return sorted(value for value, count in Counter(values).items() if count > 1)


def valid_id(value):
    return isinstance(value, str) and bool(value) and value == value.strip()


def normalize_manifest(profile, data):
    """Return canonical IDs/references and errors without mutating input."""
    name, expected, boss_key, refs_key, owner_key, count_key = profile
    errors = []

    def fail(code, detail):
        errors.append(f"{code} {name}: {detail}")

    result = {"manifest": name, "boss_ids": [], "cards": [], "errors": errors}
    if not isinstance(data, dict):
        fail("E_SCHEMA", "manifest must be an object")
        return result
    bosses, attacks, counts = data.get("bosses"), data.get("attacks"), data.get("counts")
    if not isinstance(bosses, list) or not isinstance(attacks, list) or not isinstance(counts, dict):
        fail("E_SCHEMA", "bosses/attacks must be arrays and counts must be an object")
        return result
    result.update({
        "encounters": len(bosses), "attack_cards": len(attacks), "declared_counts": counts,
        "schema_version": data.get("schema_version"), "status": data.get("status"),
        "normalization": {"boss_id": boss_key, "card_refs": refs_key,
                          "card_owner": owner_key or "derived_from_boss_references"},
    })
    for key, actual in ((count_key, len(bosses)), ("attack_cards", len(attacks))):
        if type(counts.get(key)) is not int or counts[key] != actual:
            fail("E_COUNT", f"counts.{key}={counts.get(key)!r}, actual={actual}")
    if len(bosses) != expected or len(attacks) != expected * 3:
        fail("E_COUNT", f"expected {expected} encounters/{expected * 3} cards; "
             f"found {len(bosses)}/{len(attacks)}")
    if not str(data.get("status", "")).startswith("design_only"):
        fail("E_SCOPE", "manifest must identify itself as design-only")

    attack_by_id = {}
    for index, attack in enumerate(attacks):
        if not isinstance(attack, dict) or not valid_id(attack.get("id")):
            fail("E_SCHEMA", f"attacks[{index}] lacks a valid id")
            continue
        aid = attack["id"]
        if aid in attack_by_id:
            fail("E_CARD_DUPLICATE", f"duplicate card definition {aid} within manifest")
        attack_by_id[aid] = attack

    owners = defaultdict(list)
    for index, boss in enumerate(bosses):
        if not isinstance(boss, dict) or not valid_id(boss.get(boss_key)):
            fail("E_SCHEMA", f"bosses[{index}] lacks {boss_key}")
            continue
        bid = boss[boss_key]
        result["boss_ids"].append(bid)
        alternate = "id" if boss_key == "encounter_id" else "encounter_id"
        if alternate in boss and boss[alternate] != bid:
            fail("E_SCHEMA", f"{bid} has conflicting {alternate}")
        refs = boss.get(refs_key)
        if not isinstance(refs, list) or not all(valid_id(x) for x in refs):
            fail("E_CARD_REF", f"{bid}.{refs_key} must be an array of IDs")
            continue
        if len(refs) != 3 or len(set(refs)) != 3:
            fail("E_CARD_REF", f"{bid} must reference exactly three distinct cards")
        if not valid_id(boss.get("signature")) or boss["signature"] not in refs:
            fail("E_SIGNATURE", f"{bid} signature is not one of its card references")
        for aid in refs:
            owners[aid].append(bid)
            if aid not in attack_by_id:
                fail("E_CARD_REF", f"{bid} references missing card {aid}")
    for bid in duplicates(result["boss_ids"]):
        fail("E_BOSS_DUPLICATE", bid)

    for aid, attack in attack_by_id.items():
        linked = owners.get(aid, [])
        if len(linked) != 1:
            fail("E_CARD_OWNER", f"{aid} has {len(linked)} boss references: {linked}")
            continue
        bid = linked[0]
        if owner_key is not None and attack.get(owner_key) != bid:
            fail("E_CARD_OWNER", f"{aid}.{owner_key}={attack.get(owner_key)!r}, referenced by {bid}")
        for key in ("encounter_id", "owner"):
            if key in attack and attack[key] != bid:
                fail("E_CARD_OWNER", f"{aid}.{key} conflicts with referenced owner {bid}")
        result["cards"].append({"encounter_id": bid, "attack_id": aid})
    return result


def table_cells(line):
    return [cell.strip().strip("`") for cell in line.strip().strip("|").split("|")]


def fixed_roster_ids(text):
    match = re.search(r"^### フィールドボス候補（49戦）\s*$([\s\S]*?)(?=^### |\Z)", text, re.M)
    if not match:
        raise ValueError("fixed field-roster section was not found")
    ids = []
    for line in match.group(1).splitlines():
        cells = table_cells(line)
        if len(cells) == 3 and ENCOUNTER_ID.fullmatch(cells[2]):
            ids.append(cells[2])
    return ids


def master_rows(text):
    rows = []
    for line in text.splitlines():
        cells = table_cells(line)
        if len(cells) >= 3 and ENCOUNTER_ID.fullmatch(cells[0]):
            rows.append({"id": cells[0], "moves": cells[2].split("／")})
    return rows


def audit(root):
    errors, reports, boss_ids, cards = [], [], [], []
    result = {"scope": "static_fixed_49_reference_design_only", "errors": errors,
              "manifests": reports, "runtime_tested": False, "files_modified": False}

    def read_text(path):
        try:
            return (root / path).read_text(encoding="utf-8")
        except (OSError, UnicodeError) as exc:
            errors.append(f"E_READ {path}: {exc}")
            return None

    def read_json(path):
        text = read_text(path)
        if text is None:
            return None
        try:
            return json.loads(text)
        except ValueError as exc:
            errors.append(f"E_JSON {path}: {exc}")
            return None

    cumulative_bosses = cumulative_cards = 0
    for profile in PROFILES:
        data = read_json(MANIFEST_DIR / profile[0])
        if data is None:
            continue
        normalized = normalize_manifest(profile, data)
        errors.extend(normalized.pop("errors"))
        boss_ids.extend(normalized["boss_ids"])
        cards.extend({**card, "manifest": profile[0]} for card in normalized["cards"])
        cumulative_bosses += normalized.get("encounters", 0)
        cumulative_cards += normalized.get("attack_cards", 0)
        counts = normalized.get("declared_counts", {})
        for key, actual in (("cumulative_bosses", cumulative_bosses),
                            ("cumulative_encounters", cumulative_bosses),
                            ("cumulative_attack_cards", cumulative_cards)):
            if key in counts and (type(counts[key]) is not int or counts[key] != actual):
                errors.append(f"E_COUNT {profile[0]}: {key}={counts[key]!r}, actual={actual}")
        normalized["cumulative"] = [cumulative_bosses, cumulative_cards]
        reports.append({key: value for key, value in normalized.items()
                        if key not in ("boss_ids", "cards", "declared_counts")})

    for bid in duplicates(boss_ids):
        errors.append(f"E_BOSS_DUPLICATE across manifests: {bid}")
    compound = [(card["encounter_id"], card["attack_id"]) for card in cards]
    for key in duplicates(compound):
        errors.append(f"E_COMPOUND_DUPLICATE {key}")
    if len(boss_ids) != EXPECTED_ENCOUNTERS or len(cards) != EXPECTED_CARDS:
        errors.append(f"E_COUNT normalized index {len(boss_ids)}/{len(cards)}; expected 49/147")
    covered = set(boss_ids)

    roster_text = read_text(Path(ROSTER_FILE))
    fixed = []
    if roster_text is not None:
        try:
            fixed = fixed_roster_ids(roster_text)
        except ValueError as exc:
            errors.append(f"E_ROSTER {exc}")
    master_text = read_text(Path(MASTER_FILE))
    master = master_rows(master_text) if master_text is not None else []
    for label, ids in (("fixed_roster", fixed), ("master", [row["id"] for row in master])):
        if len(ids) != EXPECTED_ENCOUNTERS:
            errors.append(f"E_COUNT {label} has {len(ids)} rows, expected 49")
        if duplicates(ids):
            errors.append(f"E_BOSS_DUPLICATE {label}: {duplicates(ids)}")
        missing, extra = sorted(set(ids) - covered), sorted(covered - set(ids))
        if missing or extra:
            errors.append(f"E_COVERAGE versus {label}: manifest_missing={missing}, manifest_extra={extra}")
    for row in master:
        if len(row["moves"]) != 3 or any(not move.strip() for move in row["moves"]):
            errors.append(f"E_CARD_REF master {row['id']} must list three nonempty move titles")
    if master_text is not None:
        links = set(re.findall(r"\]\((docs/field-boss-v1/MANIFEST_[^)]+\.json)\)", master_text))
        expected_links = {(MANIFEST_DIR / profile[0]).as_posix() for profile in PROFILES}
        if expected_links - links:
            errors.append(f"E_MASTER_REF missing manifest links: {sorted(expected_links - links)}")
        result["other_master_manifest_links"] = sorted(links - expected_links)

    by_bare = defaultdict(list)
    for card in cards:
        by_bare[card["attack_id"]].append(card)
    result["bare_id_duplicates_info"] = [
        {"attack_id": aid, "known": {c['encounter_id'] for c in occurrences} == KNOWN_BARE_COLLISIONS.get(aid),
         "occurrences": occurrences}
        for aid, occurrences in sorted(by_bare.items()) if len(occurrences) > 1
    ]
    result["totals"] = {"encounters": len(boss_ids), "unique_encounters": len(covered),
                        "attack_cards": len(cards), "unique_compound_keys": len(set(compound)),
                        "unique_bare_attack_ids": len(by_bare), "fixed_roster_rows": len(fixed),
                        "master_rows": len(master)}

    catalog = read_json(Path("content/encounters.json"))
    if isinstance(catalog, dict) and isinstance(catalog.get("encounters"), list):
        rows = catalog["encounters"]
        if not all(isinstance(row, dict) for row in rows):
            errors.append("E_SCHEMA catalog encounters must contain objects")
        else:
            normal = [row for row in rows if row.get("kind") == "normal"]
            extras = [{key: row.get(key) for key in ("id", "name", "kind", "status", "grouping")}
                      for row in normal if row.get("id") not in set(fixed)]
            result["current_catalog_info"] = {
                "total_rows": len(rows), "kind_counts": dict(Counter(row.get("kind") for row in rows)),
                "normal_rows": len(normal), "normal_status_counts": dict(Counter(row.get("status") for row in normal)),
                "complete_roster_verified": catalog.get("complete_roster_verified"),
                "normal_rows_outside_fixed_reference": extras,
                "note": "Informational current catalog; its size/status is not a completion gate for the fixed design roster.",
            }
    elif catalog is not None:
        errors.append("E_SCHEMA catalog requires an encounters array")
    result["passed"] = not errors
    return result


def self_test():
    """Three small mutation checks exercise reference, ownership and count gates."""
    profile = PROFILES[0]
    fixture = {"status": "design_only_not_runtime", "counts": {"bosses": 4, "attack_cards": 12},
               "bosses": [], "attacks": []}
    for index in range(4):
        bid = f"fixture-{index}"
        ids = [f"TEST{index}_{number}" for number in range(3)]
        fixture["bosses"].append({"encounter_id": bid, "attack_ids": ids, "signature": ids[-1]})
        fixture["attacks"].extend({"id": aid, "encounter_id": bid} for aid in ids)
    if normalize_manifest(profile, fixture)["errors"]:
        raise AssertionError("self-test valid fixture failed")
    cases = []
    missing = copy.deepcopy(fixture)
    missing["bosses"][0]["attack_ids"][0] = "MISSING"
    cases.append(("missing_card_reference", missing, "E_CARD_REF"))
    owner = copy.deepcopy(fixture)
    owner["bosses"][1]["attack_ids"][0] = owner["bosses"][0]["attack_ids"][0]
    cases.append(("duplicate_card_owner", owner, "E_CARD_OWNER"))
    count = copy.deepcopy(fixture)
    count["counts"]["attack_cards"] = 11
    cases.append(("mismatched_declared_count", count, "E_COUNT"))
    passed = []
    for name, mutated, expected_code in cases:
        errors = normalize_manifest(profile, mutated)["errors"]
        if not any(error.startswith(expected_code + " ") for error in errors):
            raise AssertionError(f"self-test {name} did not detect {expected_code}")
        passed.append(name)
    return passed


def print_report(result):
    print("STATIC DESIGN AUDIT ONLY — no runtime, visual, balance or catalog-completion claim")
    for row in result["manifests"]:
        print(f"{row['manifest']}: {row.get('encounters', 0)} encounters / "
              f"{row.get('attack_cards', 0)} cards; cumulative {row['cumulative'][0]}/{row['cumulative'][1]}")
    totals = result["totals"]
    print(f"TOTAL: {totals['encounters']} encounters / {totals['attack_cards']} cards / "
          f"{totals['unique_compound_keys']} unique (encounter_id, attack_id) keys / "
          f"{totals['unique_bare_attack_ids']} unique bare IDs")
    for item in result["bare_id_duplicates_info"]:
        owners = ", ".join(card["encounter_id"] for card in item["occurrences"])
        label = "known" if item["known"] else "additional"
        print(f"INFO {label} bare-ID reuse {item['attack_id']}: {owners}; use the compound key")
    catalog = result.get("current_catalog_info", {})
    print(f"INFO current catalog: {catalog.get('total_rows', '?')} rows; "
          f"normal={catalog.get('normal_rows', '?')}; not a fixed-roster completion claim")
    for row in catalog.get("normal_rows_outside_fixed_reference", []):
        print(f"INFO outside fixed49: {row['id']} | {row['name']} | {row['kind']} | "
              f"{row['status']} | {row['grouping']}")
    if result.get("self_tests"):
        print("SELF-TEST PASS: " + ", ".join(result["self_tests"]))
    for error in result["errors"]:
        print("FAIL " + error)
    print("PASS fixed49/147 static design index" if result["passed"] else "FAIL static design index")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[2],
                        help="repository root (default: inferred from this script)")
    parser.add_argument("--json", action="store_true", help="emit structured results to stdout")
    parser.add_argument("--self-test", action="store_true", help="also run three in-memory mutation checks")
    args = parser.parse_args()
    tests = self_test() if args.self_test else []
    result = audit(args.root.resolve())
    result["self_tests"] = tests
    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print_report(result)
    return 0 if result["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
