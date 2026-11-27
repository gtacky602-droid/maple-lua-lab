"""Verify the standard campaign save chain and measure its simulated route time."""
from argparse import ArgumentParser
from hashlib import sha256
import json
from pathlib import Path

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


def _sum_hunts(hunts, time_key, kill_key='kills'):
    seconds = kills = 0
    for row in hunts:
        seconds += row[time_key]
        kills += row[kill_key]
    return seconds, kills


def _route_segments(region, log, level):
    if region == 'cap':
        milestones = {row['id']: row for row in log['milestones']}
        split = milestones['lv180']['seconds']
        finish = milestones['lv200']['seconds']
        hunts = log['hunts']
        first = (row for row in hunts if row['toLevel'] <= 180)
        later = (row for row in hunts if row['toLevel'] > 180)
        return [(180, split, *_sum_hunts(first, 'autoSeconds', 'autoKills')),
                (200, finish-split, *_sum_hunts(later, 'autoSeconds', 'autoKills'))]

    elapsed = log['route'][-1]['seconds']
    if region == 'mondstadt':
        hunt = log['hunt']
        seconds, kills = hunt['seconds'], hunt['kills']
    elif region in ('liyue', 'inazuma'):
        seconds, kills = _sum_hunts(log['hunting'], 'seconds')
    elif region == 'snez':
        seconds, kills = _sum_hunts(log['hunts'], 'huntSeconds')
    else:
        seconds, kills = _sum_hunts(log['hunts'], 'seconds')
    return [(level, elapsed, seconds, kills)]


def _measure_pace(root, segments):
    design_path = 'docs/balance/EXPERIENCE_50H_V01.json'
    design = json.loads((root / design_path).read_bytes())
    targets = {(row['from_level'], row['to_level']): row for row in design['bands']}
    rows = []
    previous = 1
    for end, elapsed, hunting, kills in segments:
        assert 0 <= hunting <= elapsed and kills >= 0, (previous, end, elapsed, hunting, kills)
        target = targets[previous, end]
        goal = target['active_hours_goal'] * 3600
        rate = target['modeled_kills_per_hunting_minute']
        design_hunt = round(goal * target['hunt_time_fraction_draft'], 2)
        route_time = elapsed - hunting
        replay_rate = round(kills * 60 / hunting, 2) if hunting > 0 else None
        rows.append(dict(fromLevel=previous, toLevel=end, replaySeconds=round(elapsed, 2),
                         huntSeconds=round(hunting, 2), otherRouteSeconds=round(route_time, 2),
                         huntKills=kills, replayKillsPerHuntMinute=replay_rate,
                         designSeconds=goal, designHuntSeconds=design_hunt,
                         designOtherRouteSeconds=round(goal-design_hunt, 2), designKillsPerHuntMinute=rate,
                         atDesignHuntRateSeconds=round(route_time + kills * 60 / rate, 2)))
        previous = end

    totals = {field: round(sum(row[field] for row in rows), 2) for field in (
        'replaySeconds', 'huntSeconds', 'otherRouteSeconds', 'huntKills',
        'designSeconds', 'designHuntSeconds', 'designOtherRouteSeconds', 'atDesignHuntRateSeconds',
    )}
    return dict(designSource=design_path, clock='Lua simulation time during the scripted campaign',
                otherRouteScope='Travel, quests, boss fights, recovery, inventory and miscellaneous replay time.',
                rateScenario='Replay hunt kill count at the draft rate for each band, plus measured other route time.',
                totals=totals, bands=rows)


def record_standard_replay(root, command='python test_cap_fresh_route.py --replay', through=200):
    if through not in {row[2] for row in CHECKPOINTS}:
        raise ValueError(f'No standard campaign checkpoint at Lv{through}')
    rows = []
    elapsed = []
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
        trace = json.loads((root / 'evidence' / (region + '-fresh-route.json')).read_bytes())
        source = trace.get('sourceSha256')
        if rows:
            assert source == rows[-1]['saveSha256'], (region, source, rows[-1]['saveSha256'])
        if region != 'cap':
            assert trace['route'][-1]['id'] == arrival
        elapsed.extend(_route_segments(region, trace, level))
        rows.append(dict(segment=region, arrival=arrival, level=level,
                         totalExp=progression['total'], completedQuests=len(reported),
                         kills=save['kills'], saveSha256=sha256(raw).hexdigest(),
                         **({'sourceSha256':source} if source else {})))
        completed = reported
    graph = (root / 'content/story-graph.json').read_bytes()
    report = dict(command=command, profile='standard',
                  startLevel=1, verifiedThroughLevel=through, worldGraphSha256=sha256(graph).hexdigest(),
                  checkpoints=rows, pace=_measure_pace(root, elapsed))
    name = 'standard-campaign-checkpoints.json' if through == 200 else f'standard-campaign-through-lv{through}.json'
    output = root / 'evidence' / name
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
    return output


if __name__ == '__main__':
    parser = ArgumentParser(description=__doc__)
    parser.add_argument('--through', type=int, choices=[row[2] for row in CHECKPOINTS], default=200)
    args = parser.parse_args()
    command = f'python -m tools.standard_replay_report --through {args.through}'
    print(record_standard_replay(Path(__file__).resolve().parents[1], command, args.through))
