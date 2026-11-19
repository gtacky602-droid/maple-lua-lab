"""Check the design migration and exercise every linked offer in the Lua runtime."""

from collections import Counter
import json

from experience import LEVELS
from runtime import ROOT, runtime


def read(path):
    return json.loads((ROOT / path).read_text(encoding='utf8'))


manifest = read('docs/quest-v1/MANIFEST.json')
graph = read('content/story-graph.json')
daily = read('content/daily-quests.json')
nodes = {node['id']: node for node in graph['nodes']}
story_by_id = {quest['id']: quest for quest in graph['quests']}
rows = [quest for quest in graph['quests'] + daily['quests'] if 'designId' in quest]
by_design = {quest['designId']: quest for quest in rows}
migration = read('content/coverage.json')['quest_design_links']['runtime_id_by_design_id']
assert len(rows) == len(by_design) == len(migration) == manifest['counts']['total']
assert migration == {design_id: quest['id'] for design_id, quest in by_design.items()}
narrative = manifest['narrative_dependencies']
assert sum(map(len, narrative.values())) == 37
for design_id, parents in narrative.items():
    assert [by_design[design_id]['requires']] == [migration[parent] for parent in parents]

lua, core = runtime()


def new_story(level):
    state = core.new(12)
    core.action(state, 'story_start')
    core.grantExp(state, LEVELS[level - 1]['maple_reference_total_exp_to_reach'], 'quest')
    assert state.progression.level == level
    return state


def record(state, id, count, status='active', paths=None):
    # Establish earlier quest progress to isolate the acceptance boundary of the current quest.
    state.story.quests[id] = lua.table_from({
        'count': count, 'status': status, 'cycles': int(status == 'complete'),
        **({'pathProgress': {path: {'count': amount} for path, amount in paths.items()}} if paths else {}),
    }, recursive=True)


def prepare_growth(state, requirement):
    if requirement == 'imprintLesson':
        core.noteGrowth(state, 'first-imprint')
    elif requirement == 'lunarJoin':
        record(state, 'columbina-coast-detour', story_by_id['columbina-coast-detour']['goal'], 'complete')
    elif requirement == 'lightElements':
        for hub in ('mond-town', 'liyue-harbor', 'inazuma-port', 'sumeru-hub', 'fontaine-hub', 'natlan-hub',
                    'snezhnaya-hub'):
            core.enterStoryNode(state, hub)
    elif requirement == 'weeklyAccess':
        core.enterStoryNode(state, 'mond-road')
    else:
        raise AssertionError(requirement)


def prepare(state, q):
    if q.get('requires'):
        parent = q['requires']
        record(state, parent, story_by_id[parent]['goal'], 'complete')
    if q.get('opensAfter'):
        record(state, q['opensAfter'], q.get('opensAfterCount', 0), paths=q.get('opensAfterAnyPath'))
    if q.get('growthRequirement'):
        prepare_growth(state, q['growthRequirement'])


def exercise_story(q):
    id, hub = q['id'], q['hub']
    needed = q.get('level', 1)
    level = max(needed, nodes[hub]['level'], 20 if q.get('growthRequirement') == 'weeklyAccess' else 1)
    assert not q.get('legacyOnly'), q['designId']
    if q.get('itinerary'):
        assert len(q['itinerary']) == q['goal'], id
    if q.get('lesson'):
        assert len(q['lesson']) == q['goal'], id
    checks = []
    accept, report = 'story_accept:' + id, 'story_report:' + id

    def reject(s, check):
        core.action(s, accept)
        assert s.story.quests[id] is None, (id, check)
        checks.append(check)

    if needed > 1:
        s = new_story(needed - 1)
        prepare(s, q)
        core.enterStoryNode(s, hub)
        reject(s, 'below_quest_level')

    s = new_story(level)
    core.enterStoryNode(s, hub)
    if q.get('requires'):
        reject(s, 'prerequisite_unaccepted')
        parent = q['requires']
        record(s, parent, story_by_id[parent]['goal'])
        reject(s, 'prerequisite_ready_but_not_reported')
        record(s, parent, story_by_id[parent]['goal'], 'complete')
    if q.get('opensAfter'):
        parent = q['opensAfter']
        reject(s, 'prerequisite_not_started')
        if q.get('opensAfterCount'):
            record(s, parent, q['opensAfterCount'] - 1)
            reject(s, 'prerequisite_progress_too_low')
        if paths := q.get('opensAfterAnyPath'):
            record(s, parent, q.get('opensAfterCount', 0), paths={k: v - 1 for k, v in paths.items()})
            reject(s, 'prerequisite_paths_too_low')
        record(s, parent, q.get('opensAfterCount', 0), paths=q.get('opensAfterAnyPath'))
    if q.get('growthRequirement'):
        reject(s, 'growth_requirement_unfulfilled')
        prepare_growth(s, q['growthRequirement'])
    elsewhere = 'liyue-harbor' if hub == 'mond-town' else 'mond-town'
    core.enterStoryNode(s, elsewhere)
    reject(s, 'away_from_hub')
    core.enterStoryNode(s, hub)
    core.action(s, 'pause')
    reject(s, 'paused')
    core.action(s, 'pause')
    core.action(s, accept)
    progress = s.story.quests[id]
    growth = s.story.growth
    start_count = sum(bool(growth and growth[step['id']]) for step in q.get('lesson', []))
    assert progress is not None and (progress.status, progress.count, progress.cycles) == ('active', start_count, 0), id
    checks.append('started_by_runtime_at_hub')
    core.action(s, accept)
    assert s.story.quests[id].count == start_count and s.story.quests[id].cycles == 0, id
    checks.append('repeat_accept_did_not_reset_record')
    if start_count < q['goal']:
        xp, mora = s.progression.questXp, s.mora
        core.action(s, report)
        assert progress.status == 'active' and (s.progression.questXp, s.mora) == (xp, mora), id
        checks.append('premature_report_no_reward')
    return checks


def exercise_daily(q):
    id, hub = q['id'], q['hub']
    level = q['level']
    accept, claim = 'daily_accept:' + id, 'daily_claim:' + id
    checks = []

    def daily_session(lv):
        s = new_story(lv)
        core.dailyBind(s, 'b81c3a5077d14f059515d556c03e5dbf6', 20807, None)
        return s

    def reject(s, check):
        core.action(s, accept)
        assert len(s.daily.ledger.activeSlots) == 0, (id, check)
        checks.append(check)

    if level > 1:
        s = daily_session(level - 1)
        core.enterStoryNode(s, hub)
        if parent := q.get('requires'):
            record(s, parent, story_by_id[parent]['goal'], 'complete')
        reject(s, 'below_quest_level')

    s = daily_session(level)
    core.enterStoryNode(s, hub)
    if parent := q.get('requires'):
        reject(s, 'prerequisite_unaccepted')
        record(s, parent, story_by_id[parent]['goal'])
        reject(s, 'prerequisite_ready_but_not_reported')
        record(s, parent, story_by_id[parent]['goal'], 'complete')
    core.enterStoryNode(s, 'liyue-harbor' if hub == 'mond-town' else 'mond-town')
    reject(s, 'away_from_hub')
    core.enterStoryNode(s, hub)
    core.action(s, 'pause')
    reject(s, 'paused')
    core.action(s, 'pause')
    core.action(s, accept)
    ledger = s.daily.ledger
    row = ledger.activeSlots[1]
    assert len(ledger.activeSlots) == 1 and row.id == id and row.count == 0 and not row.claimed, id
    checks.append('started_by_runtime_at_hub')
    core.action(s, accept)
    core.action(s, claim)
    assert not row.claimed and len(ledger.activeSlots) == 1 and not ledger.earnedXp and not ledger.earnedMora, id
    checks.extend(('repeat_accept_did_not_reset_record', 'premature_report_no_reward'))
    return checks


evidence = {}
for design_id, q in sorted(by_design.items()):
    checks = exercise_story(q) if q['id'] in story_by_id else exercise_daily(q)
    evidence[design_id] = {'runtime_id': q['id'], 'checks': checks}

totals = Counter(check for row in evidence.values() for check in row['checks'])
assert totals['started_by_runtime_at_hub'] == len(migration)
assert totals['prerequisite_ready_but_not_reported'] >= sum(map(len, narrative.values()))
result = {
    'scope': 'Lua acceptance and premature reporting at the real runtime entry points. Prerequisites and levels use fixtures; objectives and rewards are tested by separate playthroughs.',
    'linked_story_quests': sum(row['runtime_id'] in story_by_id for row in evidence.values()),
    'linked_daily_candidates': len(daily['quests']),
    'narrative_dependencies': len(narrative),
    'checks': dict(sorted(totals.items())),
    'quests': evidence,
}
(ROOT / 'evidence/quest-design-progression.json').write_text(
    json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
print(f'Lua accepted {len(migration)} linked quests at the right hubs, including {len(narrative)} narrative dependencies.')
