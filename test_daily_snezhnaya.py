"""Exercise the five Snezhnaya dailies and all 40 design-to-runtime mappings."""
import json

from experience import LEVELS
from runtime import ROOT, native, runtime
from savegame import validate_save


lua, core = runtime()
hub, field, shed = 'snezhnaya-hub', 'snezhnaya-field', 'sne-survey-shed'
outskirts, cut = 'sne-survey-outskirts', 'white-pass-cut'
patrol, survey, forest, tour, elites = (
    'daily-sne-' + name for name in ('patrol', 'survey-road', 'forest-road', 'tour-route', 'elites')
)


def load_json(path):
    return json.loads((ROOT / path).read_text(encoding='utf8'))


def start(level, node):
    state = core.new(12)
    core.action(state, 'story_start')
    core.dailyBind(state, '02d22468fa26486dbeaec9a9eeb2f771', 20807, None)
    core.grantExp(state, LEVELS[level - 1]['maple_reference_total_exp_to_reach'], 'quest')
    core.enterStoryNode(state, node)
    return state


def act(state, quest, command='accept'):
    core.action(state, f'daily_{command}:{quest}')


def counts(state):
    return {row.id: row.count for row in state.daily.ledger.activeSlots.values()}


def defeat(state, node, spawn, actor=1):
    core.enterStoryNode(state, node)
    enemy = next(enemy for enemy in state.enemies.values() if enemy.spawnId == spawn)
    assert core.defeatEnemy(state, enemy, actor)
    return enemy


def gate(state, x, destination):
    state.actors[state.active].x = x
    portal = core.frame(state).storyNearbyPortal
    assert portal.to == destination and portal.available
    core.action(state, 'story_nearby_portal')
    assert state.story.node == destination


def checkpoint(state):
    return validate_save(native(core.checkpoint(state)))


def write_json(path, payload):
    (ROOT / path).write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n', encoding='utf8')


s = start(139, hub)
act(s, patrol)
assert not counts(s)
core.enterStoryNode(s, shed)
s.actors[1].x = 535
assert not core.frame(s).storyNearbyPortal.available

s = start(140, hub)
core.action(s, 'companion:mitya')
assert next(offer.companion for offer in core.frame(s).daily.dailyChoices.values() if offer.id == survey)
write_json('work/daily-sne-level-fixture.json', checkpoint(s))
gate(s, 417, shed)
gate(s, 535, outskirts)
assert len(s.enemies) == 8
gate(s, 63, shed)
gate(s, 63, hub)
for quest in (patrol, survey, tour):
    act(s, quest)
defeat(s, 'nod-field', 'nod-field-1')
assert counts(s) == {patrol: 0, survey: 0, tour: 0}
for _ in range(59):
    defeat(s, outskirts, 'sne-outskirts-beetle-west')
defeat(s, 'sne-survey-ridge', 'sne-survey-ice-slime', 2)
assert counts(s) == {patrol: 60, survey: 60, tour: 59}
defeat(s, field, 'snezhnaya-field-1')
assert counts(s) == {patrol: 61, survey: 60, tour: 60}
for _ in range(139):
    defeat(s, 'novokichev-depth', 'novokichev-depth-1')
assert counts(s) == {patrol: 200, survey: 60, tour: 60}
act(s, patrol, 'claim')
assert s.daily.ledger.earnedXp == 0
core.enterStoryNode(s, hub)
write_json('work/daily-sne-ready-fixture.json', checkpoint(s))
for quest in (patrol, survey, tour):
    act(s, quest, 'claim')
    act(s, quest, 'claim')
core.dailySettle(s)
core.dailySettle(s)
assert (s.daily.paidXp, s.daily.paidMora) == (2945020, 11250)
checkpoint(s)

s = start(140, hub)
act(s, forest)
act(s, elites)
defeat(s, outskirts, 'sne-outskirts-beetle-west')
defeat(s, field, 'snezhnaya-field-1')
assert counts(s) == {forest: 0, elites: 0}
defeat(s, 'snezhnaya-entry', 'snezhnaya-entry-1')
defeat(s, 'white-pass-woods', 'white-pass-woods-1')
defeat(s, cut, 'white-pass-route-cart')
enemy = defeat(s, outskirts, 'sne-outskirts-elite')
assert not core.defeatEnemy(s, enemy, 1)
assert counts(s) == {forest: 3, elites: 2}
s.actors[2].hp = 0
advance = lua.eval('function(C,s,n) for i=1,n do C.step(s,1/60,{}) end end')
advance(core, s, 370)
assert enemy.hp > 0 and core.defeatEnemy(s, enemy, 1)
for _ in range(77):
    defeat(s, cut, 'white-pass-cut-1')
assert counts(s) == {forest: 80, elites: 3}
core.enterStoryNode(s, hub)
for quest in (forest, elites):
    act(s, quest, 'claim')
core.dailySettle(s)
assert (s.daily.paidXp, s.daily.paidMora) == (1081380, 6300)
checkpoint(s)

rules = load_json('content/daily-quests.json')
manifest = load_json('docs/quest-v1/MANIFEST.json')
nodes = load_json('content/story-graph.json')['nodes']
authored = {q['designId']: q for q in rules['quests']}
expected = {f"Q-{region['code']}-D{index:02}": (title, region)
            for region in manifest['regions'] for index, title in enumerate(region['daily'], 1)}
assert len(authored) == len(rules['quests']) == len(expected) == 40
assert set(authored) == set(expected)
assert len({q['id'] for q in rules['quests']}) == 40
witnesses = {}
for design_id, (title, region) in expected.items():
    q = authored[design_id]
    filters = q['filter']
    region_config = rules['regions'][q['region']]
    assert (q['name'], q['level'], region_config['label']) == (
        title, region['start_level_draft'], region['name'])
    assert q['kind'] == ('main' if design_id.endswith('D01') else 'extra')
    s = start(q['level'], q['hub'])
    if q.get('requires'):
        s.story.quests[q['requires']] = lua.table_from({'status': 'complete'})
    act(s, q['id'])
    assert counts(s) == {q['id']: 0}, design_id
    for node in nodes:
        if (node['level'] > q['level'] or node.get('hub') or node.get('peaceful')
                or node['region'] not in region_config['includeRegions']
                or filters.get('nodes') and node['id'] not in filters['nodes']):
            continue
        core.enterStoryNode(s, node['id'])
        for enemy in list(s.enemies.values()):
            if core.defeatEnemy(s, enemy, 1) and counts(s)[q['id']] == 1:
                witnesses[design_id] = {'node': node['id'], 'spawn': enemy.spawnId}
                break
        if design_id in witnesses:
            break
    assert design_id in witnesses, f'{design_id} has no eligible foe at Lv{q["level"]}'

s = start(140, 'mond-town')
for design_id in ('Q-MON-D01', 'Q-MON-D02', 'Q-LIY-D02'):
    q = authored[design_id]
    core.enterStoryNode(s, q['hub'])
    act(s, q['id'])
profile = s.daily.profile
used = counts(s)
assert len(used) == 3
visited = set()
for q in rules['quests']:
    core.enterStoryNode(s, q['hub'])
    visited.add(q['hub'])
    act(s, q['id'])
    assert s.daily.profile == profile and counts(s) == used
assert len(visited) == 8
checkpoint(s)

# Measure a complete run with ordinary walking and attacks at 60 simulated ticks per second.
s = start(140, hub)
act(s, patrol)
act(s, forest)
play_cut = lua.eval("""
function(C, s)
 local function walkGate(x, destination)
  for _=1,720 do
   local actor=s.actors[s.active]
   if math.abs(actor.x-x)<8 then break end
   C.step(s,1/60,{left=actor.x>x,right=actor.x<x,attack=true})
  end
  C.action(s,'story_nearby_portal')
  assert(s.story.node==destination, s.story.node)
 end
 local function reachCut()
  walkGate(1380,'snezhnaya-field')
  walkGate(865,'white-pass-cut')
 end
 local started=s.t
 reachCut()
 local main=s.daily.ledger.activeSlots[1]
 while main.count<200 and s.t-started<360 do
  if s.story.node=='snezhnaya-hub' then reachCut() end
  local actor=s.actors[s.active]
  local target,distance
  for _,enemy in ipairs(s.enemies) do
   local dx=math.abs(enemy.x-actor.x)
   if enemy.hp>0 and math.abs(enemy.y-actor.y)<=58 and (not distance or dx<distance) then
    target,distance=enemy,dx
   end
  end
  local input={attack=true}
  if target and (distance>36 or (target.x-actor.x)*actor.dir<0) then
   input.left=target.x<actor.x
   input.right=target.x>actor.x
  end
  C.step(s,1/60,input)
 end
 local finish=s.t
 walkGate(60,'snezhnaya-field')
 walkGate(60,'snezhnaya-hub')
 return finish-started,s.t-started
end
""")
to_goal, round_trip = play_cut(core, s)
assert counts(s) == {patrol: 200, forest: 80}
act(s, patrol, 'claim')
core.dailySettle(s)
assert s.daily.paidXp == 1840640
checkpoint(s)

write_json('evidence/daily-sne-lua.json', {
    'completedGoals': {'Q-SNE-D01': 200, 'Q-SNE-D02': 60, 'Q-SNE-D03': 80, 'Q-SNE-D04': 60, 'Q-SNE-D05': 3},
    'level140PublicRouteToOutskirts': True,
    'mityaCompanionGiver': True,
    'novokichevCountsForMain': True,
    'surveyAndTourOverlapAtOutskirts': True,
    'namedElitesRespawn': True,
    'claimAtHubOnce': True,
    'ordinaryInput200KillRun': {
        'start': 'snezhnaya-hub',
        'hunt': cut,
        'startingLevel': 140,
        'companion': 'amber',
        'controls': 'walk, nearby portal, hold normal attack',
        'secondsToGoalSimulated': round(to_goal, 1),
        'roundTripSecondsSimulated': round(round_trip, 1),
        'partyWipeReturns': s.returns,
    },
})
write_json('evidence/daily-catalog.json', {
    'designMappings': len(witnesses),
    'acceptedAtEachStartingLevel': True,
    'eligibleDefeatWitnesses': witnesses,
    'sameProfileHubCount': len(visited),
    'globalMainLimit': 1,
    'globalExtraLimit': 2,
})
print('Snezhnaya: five goals complete; all 40 candidates accept and count an actual defeat; three slots across eight hubs')
