"""Summarize the Lv1-200 standard replay after its final save has been verified."""
from hashlib import sha256
import json

CHECKPOINTS = [
    ('mondstadt', 'liyue-save', 20, 'liyue-harbor'),
    ('liyue', 'inazuma-save', 40, 'inazuma-port'),
    ('inazuma', 'sumeru-save', 60, 'sumeru-hub'),
    ('sumeru', 'fontaine-save', 80, 'fontaine-hub'),
    ('fontaine', 'natlan-save', 100, 'natlan-hub'),
    ('natlan', 'nod-save', 120, 'nod-town'),
    ('nod', 'snezhnaya-save', 140, 'snezhnaya-hub'),
    ('snez', 'white-pass-save', 160, 'white-pass-station'),
    ('cap', 'lv200-save', 200, 'white-pass-station'),
]


def record_standard_replay(root, command='python test_cap_fresh_route.py --replay', through=200):
    if through not in {row[2] for row in CHECKPOINTS}:
        raise ValueError(f'No standard campaign checkpoint at Lv{through}')
    rows = []
    completed = set()
    for region, filename, level, arrival in CHECKPOINTS:
        if level > through:
            break
        path = root / 'work' / (region + '-fresh-route') / (filename + '.json')
        raw = path.read_bytes()
        save = json.loads(raw)
        story, progression = save['story'], save['progression']
        assert (story['node'], progression['level']) == (arrival, level)
        reported = {qid for qid, state in story['quests'].items() if state['status'] == 'complete'}
        assert completed <= reported, (region, completed - reported)
        source = json.loads((root / 'evidence' / (region + '-fresh-route.json')).read_bytes()).get('sourceSha256')
        if level >= 100:
            assert source == rows[-1]['saveSha256'], (region, source, rows[-1]['saveSha256'])
        rows.append(dict(segment=region, arrival=arrival, level=level,
                         totalExp=progression['total'], completedQuests=len(reported),
                         kills=save['kills'], saveSha256=sha256(raw).hexdigest(),
                         **({'sourceSha256':source} if level >= 100 else {})))
        completed = reported
    graph = (root / 'content/story-graph.json').read_bytes()
    report = dict(command=command, profile='standard',
                  startLevel=1, verifiedThroughLevel=through, worldGraphSha256=sha256(graph).hexdigest(),
                  checkpoints=rows)
    name = 'standard-campaign-checkpoints.json' if through == 200 else f'standard-campaign-through-lv{through}.json'
    output = root / 'evidence' / name
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
