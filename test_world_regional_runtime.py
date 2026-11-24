"""Rerun the regional movement checks and reconcile visits with the imported markers."""
from concurrent.futures import ThreadPoolExecutor
import json
import subprocess
import sys

from runtime import ROOT


SUITES = (
    ('mondstadt', 'visited_stages', 'directed_gates_walked'),
    ('liyue', 'stage_ids', 'directed_crossings'),
    ('chasm', 'visited_stages', 'directed_gates_walked'),
    ('inazuma', 'stage_ids', 'directed_crossings'),
    ('sumeru', 'mapped_stage_ids', 'directed_crossings'),
    ('fontaine', 'visited_stages', 'directed_gates'),
    ('natlan', 'visited_stages', 'directed_crossings'),
    ('nod', 'stage_ids', 'directed_paths'),
    ('snezhnaya', 'stage_ids', 'directed_paths'),
)


def read(path):
    return json.loads((ROOT / path).read_text(encoding='utf8'))


def run_suite(spec):
    name, visits_key, crossings_key = spec
    script = f'test_{name}_waypoints.py'
    path = f'evidence/{name}-waypoint-test.json'
    result = subprocess.run([sys.executable, '-X', 'utf8', script], cwd=ROOT,
                            capture_output=True, text=True, encoding='utf8')
    if result.returncode:
        raise AssertionError(f'{script} failed:\n{result.stdout}{result.stderr}')
    print(result.stdout.strip(), flush=True)
    report = read(path)
    visits = set(report[visits_key])
    crossings = report[crossings_key]
    if isinstance(crossings, list):
        crossings = len(crossings)
    assert crossings > 0, script
    return path, visits, crossings


def main():
    links = read('content/coverage.json')['map_catalog']['stage_links']
    marker_by_stage = {row['stage_id']: marker for marker, row in links.items()}
    catalog = read('content/map-catalog.json')
    assert len(marker_by_stage) == len(links) and set(links) == {marker['id'] for marker in catalog['nodes']}
    with ThreadPoolExecutor(max_workers=3) as workers:
        reports = list(workers.map(run_suite, SUITES))
    audited, suites = set(), []
    for path, visits, crossings in reports:
        markers = {marker_by_stage[stage] for stage in visits & marker_by_stage.keys()}
        assert not audited & markers, (path, sorted(audited & markers))
        audited.update(markers)
        suites.append(dict(evidence=path, visitedMarkers=len(markers), directedCrossings=crossings))
    assert audited == set(links), sorted(set(links) - audited)
    total = sum(suite['directedCrossings'] for suite in suites)
    evidence = dict(
        method='Nine Lua movement suites rerun with regional fixtures and scoped quest progress.',
        visitedMarkers=len(audited), directedCrossingsAcrossSuites=total, suites=suites,
    )
    (ROOT / 'evidence/world-map-runtime.json').write_text(
        json.dumps(evidence, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
    print(f'{len(audited)} imported markers covered in {total} directed crossings across the nine suites.')


if __name__ == '__main__':
    main()
