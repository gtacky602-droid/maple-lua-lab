#!/usr/bin/env python3
"""Validate the quest design index; never imports or edits runtime game data."""
from __future__ import annotations
import argparse
import json
import re
import sys
from collections import Counter
from pathlib import Path, PurePosixPath
from typing import Any

EXPECTED = {"main": 24, "side": 40, "daily_candidate": 40,
            "high_difficulty": 27, "hidden_world": 6, "growth": 16}
LEVELS = [1, 20, 40, 60, 80, 100, 120, 140]
POWERS = [3, 8, 10, 13, 25, 30, 35, 40, 50]
ID_PATTERN = re.compile(r"^Q-(?:[A-Z]{3}-[MSD]\d{2}|[BH]\d{2}-\d{2}|G\d{2})$")

def validate(data: dict[str, Any], root: Path, index_only: bool = False) -> dict[str, Any]:
    errors: list[str] = []
    records: list[tuple[str, str, str, str]] = []
    def check(condition: bool, message: str) -> None:
        if not condition:
            errors.append(message)
    check(data.get("schema_version") == 1, "unsupported schema_version")
    check(data.get("status") == "design_only" and data.get("runtime_import_allowed") is False,
          "index must remain design-only")
    check(data.get("mechanical_skill_gates_added") is False, "new skill gates forbidden")
    check(data.get("all_regions_required_for_growth") is False, "all-region growth gate forbidden")
    check(data.get("global_daily_slots") == {"main": 1, "additional": 2, "status": "proposal"},
          "daily slots must remain global 1+2 proposal")
    regions = data["regions"]
    check(len(regions) == 8, "expected 8 regions")
    check([r["start_level_draft"] for r in regions] == LEVELS, "region levels changed")
    check(len({r["code"] for r in regions}) == 8, "duplicate region code")
    check(len({r["companion"] for r in regions}) == 8, "expected 8 distinct companions")
    for i, r in enumerate(regions, 1):
        check(r["id"] == f"region-{i:02d}", "region order/id mismatch")
        expected_join = f"Q-{r['code']}-" + ("M01" if i == 1 else "S01")
        check(r["join_quest"] == expected_join, "early companion join mismatch")
        for key, prefix, kind, n in (("main", "M", "main", 3), ("side", "S", "side", 5),
                                     ("daily", "D", "daily_candidate", 5)):
            check(len(r[key]) == n, f"{r['id']} {key} count mismatch")
            doc = data["daily_doc"] if key == "daily" else r["doc"]
            records.extend((f"Q-{r['code']}-{prefix}{j:02d}", kind, title, doc)
                           for j, title in enumerate(r[key], 1))
    branches = data["branches"]
    check(len(branches) == 9, "expected 9 branches")
    check([b["power_reference"] for b in branches] == POWERS, "branch reference values changed")
    for i, b in enumerate(branches, 1):
        check(b["id"] == f"branch-{i:02d}" and len(b["quests"]) == 3, "branch order/count mismatch")
        check(b["power_is_entry_lock"] is False, "power is advisory, not an entry lock")
        records.extend((f"Q-B{i:02d}-{j:02d}", "high_difficulty", t, data["branch_doc"])
                       for j, t in enumerate(b["quests"], 1))
    check(len(data["hidden_worlds"]) == 3, "expected 3 hidden worlds")
    for i, h in enumerate(data["hidden_worlds"], 1):
        check(h["id"] == f"hidden-{i:02d}" and len(h["quests"]) == 2, "hidden order/count mismatch")
        records.extend((f"Q-H{i:02d}-{j:02d}", "hidden_world", t, data["hidden_doc"])
                       for j, t in enumerate(h["quests"], 1))
    for g in data["growth"]:
        check(g["new_skill_gate"] is False, f"{g['id']} adds a skill gate")
        records.append((g["id"], "growth", g["title"], data["growth_doc"]))
    ids = [q[0] for q in records]
    check(len(ids) == len(set(ids)), "duplicate quest id")
    for qid, _, title, doc in records:
        check(ID_PATTERN.fullmatch(qid) is not None, f"invalid id {qid}")
        check(isinstance(title, str) and bool(title.strip()), f"empty title {qid}")
        p = PurePosixPath(doc)
        check(not p.is_absolute() and ".." not in p.parts and p.suffix == ".md", f"unsafe doc path {doc}")
    counts = dict(Counter(q[1] for q in records))
    check(counts == EXPECTED, "expanded counts mismatch")
    check(data["counts"] == {**EXPECTED, "total": sum(EXPECTED.values())}, "declared counts mismatch")
    known = set(ids)
    for r in regions:
        check(r["join_quest"] in known, "unknown join quest")
    graph = data["narrative_dependencies"]
    for qid, deps in graph.items():
        check(qid in known and all(d in known for d in deps), f"unknown dependency for {qid}")
        check(not qid.startswith("Q-G"), "growth may not gain narrative prerequisites")
    visiting: set[str] = set()
    done: set[str] = set()
    def visit(qid: str) -> None:
        if qid in visiting:
            errors.append("cyclic narrative dependencies")
            return
        if qid in done:
            return
        visiting.add(qid)
        for dep in graph.get(qid, []):
            visit(dep)
        visiting.remove(qid)
        done.add(qid)
    for qid in graph:
        visit(qid)
    skills = {s["skill"]: s for s in data["skill_milestones"]}
    check({k: s["level"] for k, s in skills.items()} ==
          {"SK54": 127, "SK55": 133, "SK56": 149, "SK57": 155, "SK58": 160, "SK59": 170, "SK60": 180},
          "skill milestones changed")
    check(all(skills[k].get("companion") == "コロンビーナ" for k in ("SK54", "SK55")), "moon partner mismatch")
    check(skills["SK56"].get("companion_element") == "風" and skills["SK57"].get("companion_element") == "雷", "star partner mismatch")
    check(all(skills[k].get("all_seven_elements") is True for k in ("SK58", "SK59", "SK60")), "seven-element condition mismatch")
    check(skills["SK58"].get("gauge_cost") == 60 and skills["SK60"].get("gauge_cost") == 100, "gauge costs mismatch")
    check(skills["SK59"].get("requires_light_form") is True and skills["SK60"].get("level_cap_claim") is False, "light form/cap mismatch")
    check(data["light_values"] == {"equipment_power_max": 50, "equipment_slots_in_current_pair": 10,
          "shared_gauge_max": 100, "separate_ultimate_gauge": False}, "light values conflated")
    docs_checked = 0
    if not index_only:
        cache: dict[str, str] = {}
        for _, _, _, doc in records:
            if doc not in cache:
                path = root / doc
                if path.is_file():
                    cache[doc] = path.read_text(encoding="utf-8")
                else:
                    errors.append(f"missing document {doc}")
                    cache[doc] = ""
        for qid, kind, title, doc in records:
            text = cache[doc]
            if kind == "daily_candidate":
                check(any(qid in line and title in line for line in text.splitlines() if line.startswith("|")),
                      f"daily row/title missing {qid}")
            else:
                pattern = r"(?m)^#{2,3} " + re.escape(qid) + r" " + re.escape(title) + r"\s*$"
                check(re.search(pattern, text) is not None, f"heading/title missing {qid}")
        docs_checked = len(cache)
    return {"passed": not errors, "scope": "index_only" if index_only else "index_and_prose",
            "unique_ids": len(set(ids)), "total": len(records), "counts": counts,
            "dependency_edges": sum(len(v) for v in graph.values()), "documents_checked": docs_checked,
            "runtime_tests_run": False, "errors": errors}

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, default=Path(__file__).with_name("MANIFEST.json"))
    parser.add_argument("--index-only", action="store_true", help="Skip local prose existence/title checks.")
    args = parser.parse_args()
    try:
        data = json.loads(args.manifest.read_text(encoding="utf-8"))
        report = validate(data, args.manifest.parent, args.index_only)
    except (OSError, ValueError, KeyError, TypeError, RecursionError) as exc:
        report = {"passed": False, "scope": "invalid_input", "runtime_tests_run": False, "errors": [str(exc)]}
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["passed"] else 1

if __name__ == "__main__":
    sys.exit(main())
