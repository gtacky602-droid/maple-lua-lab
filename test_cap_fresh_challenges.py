"""Exercise the three challenge lessons on the Lv200 save earned from Lv1."""
from argparse import ArgumentParser
from hashlib import sha256
import json

from runtime import ROOT, native, runtime
from savegame import validate_save
from tools.waypoint_test import TrailWalk


def read(path):
    return json.loads(path.read_text(encoding='utf8'))


parser = ArgumentParser(description=__doc__)
parser.add_argument('--draft-balance', action='store_true', help='Continue the earned draft Lv200 save')
draft = parser.parse_args().draft_balance
suffix = '-draft' if draft else ''
work = ROOT / 'work' / ('cap-fresh-route' + suffix)
source = (work / 'lv200-save.json').read_bytes()
saved = validate_save(json.loads(source))
assert saved['progression']['level'] == 200
assert saved['story']['quests']['growth-next-goal']['status'] == 'complete'
lua, core = runtime(draft_balance=draft)
state = core.restore(lua.table_from(saved, recursive=True), 12)
gates = {n['id']: n['exits'] for n in read(ROOT / 'content/story-graph.json')['nodes']}
edges = {(id, edge['to']): edge for id, exits in gates.items() for edge in exits}
trail = TrailWalk(lua, core, state, edges, gates)
advance = lua.eval('function(C,s,n,input) for _=1,n do C.step(s,1/60,input) end end')
attack = lua.table_from({'attack': True})
town, station = 'mond-town', 'white-pass-station'
abyss, stygian, weekly = 'growth-abyss', 'growth-stygian', 'growth-weekly'


def act(action):
    core.action(state, action)


def accept(id):
    act('story_accept:' + id)
    assert state.story.quests[id].status == 'active'


def report(id):
    act('story_report:' + id)
    quest = state.story.quests[id]
    assert quest.status == 'complete' and quest.cycles == 1, (id, state.storyNotice)
    before = state.progression.total
    act('story_report:' + id)
    assert state.progression.total == before


def leave():
    act('endgame_exit')
    assert state.story.node == town and state.endgameRun is None
    if state.auto:
        act('auto')


act('story_fast:' + town)
assert state.story.node == town
if state.active != 1:
    act('swap')
assert state.active == 1

accept(abyss)
next_item = state.inventory.nextId
act('abyss_start:entry:troupe')
act('auto')
rooms = []
for _ in range(720):
    advance(core, state, 15, trail.idle)
    run = state.endgameRun
    if run.status == 'between':
        rooms.append(run.room)
        act('endgame_next')
    elif run.status == 'clear':
        rooms.append(run.room)
        break
    else:
        assert run.status == 'fighting', run.status
assert rooms == [1, 2, 3]
stars = run.stars
all_loot = list(state.inventory['items'].values()) + [drop.item for drop in state.inventory.ground.values()]
reward = next(item for item in all_loot if item.id == next_item)
assert reward.setId == 'troupe' and reward.rarity == 3
leave()
report(abyss)

accept(stygian)
act('endgame_farka')
act('auto')
for _ in range(240):
    advance(core, state, 15, trail.idle)
    if state.endgameRun.status != 'fighting':
        break
assert state.endgameRun.status == 'clear' and state.farka.hp == 0
leave()
report(stygian)

accept(weekly)
trail.cross('mond-road')
trail.cross('andrius-wolf-ring')
boss, _ = core.currentWeeklyBoss(state)
before_hp = boss.primary.hp
trail.approach(boss.primary.x - 52, boss.primary.y, 'weekly boss')
for _ in range(10):
    advance(core, state, 21, attack)
    if state.story.quests[weekly].count:
        break
assert state.story.quests[weekly].count == 1 and 0 <= boss.primary.hp < before_hp
act('story_fast:' + town)
assert state.story.node == town
report(weekly)
act('story_fast:' + station)
assert state.story.node == station

after = validate_save(native(core.checkpoint(state)))
restore = core.restore(lua.table_from(after, recursive=True), 12)
roundtrip = validate_save(native(core.checkpoint(restore)))
assert roundtrip['progression'] == after['progression']
assert roundtrip['endgame'] == after['endgame']
assert roundtrip['story']['quests'] == after['story']['quests']
growth = read(ROOT / 'evidence' / f'cap-fresh-route{suffix}.json')['growthQuests'] + [abyss, stygian, weekly]
assert all(roundtrip['story']['quests'][id]['status'] == 'complete' for id in growth)
exp = after['progression']['total'] - saved['progression']['total']
assert exp > 0 and after['progression']['level'] == 200 and after['progression']['xp'] == 0
assert after['progression']['overflowXp'] - saved['progression']['overflowXp'] == exp
proof = dict(completedQuests=[abyss, stygian, weekly], abyssRooms=rooms, abyssStars=stars,
             abyssRewardSet=reward.setId, abyssRewardRarity=reward.rarity, farkaTrialCleared=True,
             weeklyBoss='andrius', weeklyAttackRegistered=True, weeklyDefeated=boss.primary.hp==0,
             extraExpAtCap=exp, savedAndRestored=True)
if draft:
    assert roundtrip['weapons'] == saved['weapons']
    proof.update(sourceSha256=sha256(source).hexdigest(), draftBalance=True)
(work / 'lv200-challenges-save.json').write_text(json.dumps(after, ensure_ascii=False) + '\n', encoding='utf8')
(ROOT / 'evidence' / f'cap-fresh-challenges{suffix}.json').write_text(
    json.dumps(proof, indent=2) + '\n', encoding='utf8')
print(proof)
