"""Replay the reviewed Lua encounters and compare archived poses with source art."""
import argparse
import json
import subprocess
import sys
from pathlib import Path
from zipfile import ZipFile


def read(path):
    return json.loads(path.read_bytes())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1],
                        help="Lab checkout or isolated replay directory (tests write work and evidence)")
    root = parser.parse_args().root.resolve()
    evidence = root / "evidence"
    scenarios = read(evidence / "boss-roster-lua-audit.json")["scenarios"]
    review = read(root / "content/encounter-roster-review.json")
    matches = read(root / "content/stygian-matches.json")["matches"]
    roster = {}
    for kind in ("normal", "weekly", "stygian"):
        expected = ({match["challenge"] for match in matches.values()} if kind == "stygian"
                    else {row for family in review[kind] for row in family["rows"]})
        actual = {key for key, case in scenarios.items() if case["kind"] == kind}
        if expected != actual:
            raise ValueError(f"{kind} roster mismatch: {sorted(expected ^ actual)}")
        roster[kind] = len(actual)

    archives = {}
    scripts = ["test_normal_boss_lifecycle.py", *(case["script"] for case in scenarios.values()),
               "test_stygian_tier_expedition.py", "test_weekly_tier_expedition.py",
               "test_original_weekly_expedition.py"]
    for group in ("field_boss", "weekly", "stygian"):
        scripts.append(f"test_{group}_packed_poses.py")
        archive = root / "assets" / (group.replace("_", "-") + "-poses.zip")
        with ZipFile(archive) as poses:
            names = poses.namelist()
            archives[group] = dict(poses=len(names), archiveBytes=archive.stat().st_size,
                                   sourceJsonBytes=sum((root / "assets" / n).stat().st_size for n in names))
    passed = []
    for script in dict.fromkeys(scripts):
        subprocess.run([sys.executable, "-X", "utf8", str(root / script)], cwd=root, check=True)
        passed.append(script)
    report = dict(reviewedVersion=review["game_version"], normalFamilies=len(review["normal"]),
                  roster=roster, archives=archives, passed=passed)
    (evidence / "boss-roster-replay.json").write_text(
        json.dumps(report, indent=2) + "\n", encoding="utf8")


if __name__ == "__main__":
    main()
