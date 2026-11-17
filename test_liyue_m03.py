"""Play the chapter finale with regular movement, interactions, and combat."""
import json

from runtime import ROOT, native, runtime
from savegame import validate_save

lua, core = runtime()
port, post, room = 'liyue-harbor', 'liyue-quarry-post', 'liyue-quarry-storage'
qid = 'liyue-market-opening'
keeper = 'liyue-quarry-storage-keeper'
session = core.new(12)
core.action(session, 'story_start')
core.grantExp(session, sum(core.expNeeded(level) for level in range(1, 20)), 'quest')
core.enterStoryNode(session, port)
core.action(session, 'story_accept:'+qid)
assert not session.story.quests[qid]
assert not core.frame(session).storyMarketOpen

seed = native(core.checkpoint(session))
seed['story']['quests'] = {
    'liyue-market-delivery': {
        'status': 'complete', 'count': 3, 'cycles': 1,
        'delivery': {'guardCleared': True, 'recovered': True,
                     'delivered': {'pot': True, 'vessel': True, 'wheel': True}},
    },
    'liyue-caravan-search': {
        'status': 'complete', 'count': 3, 'cycles': 1,
        'inspected': {'cart-ruts': True, 'caravan': True},
    },
}
validate_save(seed)
(ROOT/'work').mkdir(exist_ok=True)
(ROOT/'work/liyue-m03-fixture.json').write_text(json.dumps(seed), encoding='utf8')


def step(**controls):
    core.step(session, 1/60, lua.table_from(controls))


def walk(x, attack=False):
    for _ in range(750):
        actor = session.actors[session.active]
        if abs(actor.x-x) < 8:
            return
        step(right=actor.x<x, left=actor.x>x, attack=attack)
    raise AssertionError(('cannot walk', session.story.node, x))


def jump(y, x):
    core.action(session, 'jump')
    for _ in range(120):
        actor = session.actors[session.active]
        step(jump=True, right=actor.x<x-3, left=actor.x>x+3)
        if actor.ground and actor.y == y:
            return
    raise AssertionError(('cannot land', session.story.node, y, x))


def go(dest):
    edge = core.frame(session).storyNearbyPortal
    assert edge and edge.to == dest and edge.available, native(edge)
    core.action(session, 'story_nearby_portal')
    for _ in range(135):
        if session.story.node == dest:
            return
        assert session.lift
        step()
    raise AssertionError(('not arrived', dest))


def approach_storage():
    walk(1165)
    go(post)
    walk(1370)
    jump(389, 1380)
    jump(305, 1420)
    walk(1490)
    go(room)


def saved():
    return validate_save(native(core.checkpoint(session)))


session = core.restore(lua.table_from(seed, recursive=True))
core.action(session, 'story_accept:'+qid)
approach_storage()
q = session.story.quests[qid]
base_platforms = len(session.platforms)
assert {e.spawnId for e in session.enemies.values()} == {
    'liyue-quarry-storage-1', 'liyue-quarry-storage-2',
}
walk(658, attack=True)
core.action(session, 'story_collect')
assert not session.railTrip and q.count == 0  # Same X, wrong elevation.
walk(380, attack=True)
jump(397, 400)
walk(490, attack=True)
jump(312, 520)
walk(658)
assert core.frame(session).storyNearbyClue.id == 'cart-latch'
core.action(session, 'story_collect')
for _ in range(60):
    step(right=True)
assert 750 < core.frame(session).storyCartX < 1030
assert session.actors[session.active].x > 658 and q.count == 0
core.action(session, 'pause')
x = core.frame(session).storyCartX
for _ in range(90):
    step()
assert core.frame(session).storyCartX == x
assert saved()['story']['quests'][qid]['count'] == 0
core.action(session, 'pause')
for _ in range(90):
    step()
assert q.count == 1 and not session.railTrip
assert len(session.platforms) == base_platforms+1
assert core.frame(session).storyElite.name == '石切り場の番人'

session = core.restore(lua.table_from(saved(), recursive=True))
assert session.story.node == port and session.story.quests[qid].count == 1
approach_storage()
q = session.story.quests[qid]
assert len(session.platforms) == base_platforms+1
assert {e.spawnId for e in session.enemies.values()} == {keeper, 'liyue-quarry-storage-3'}
walk(1025)
jump(411, 1025)
walk(1148)
jump(397, 1210)
core.action(session, 'drop')
for _ in range(80):
    step()
assert session.actors[session.active].y == 480
walk(1250, attack=True)
for _ in range(520):
    if q.count == 2:
        break
    step(attack=True)
assert q.count == 2
assert core.frame(session).storyCleared and len(session.enemies) == 0
walk(1670)
assert not core.frame(session).storyNearbyPortal.available
walk(1030)
assert core.frame(session).storyNearbyClue.id == 'market-switch'
core.action(session, 'story_collect')
core.action(session, 'story_collect')
walk(1670)
assert q.count == 2 and not core.frame(session).storyNearbyPortal.available
assert saved()['story']['quests'][qid]['count'] == 2
for _ in range(220):
    step()
assert q.count == 3 and not session.railTrip
go(port)
assert core.frame(session).storyMarketOpen
assert not session.story.quests['beidou-join']
balance, xp = session.mora, session.progression.questXp
core.action(session, 'story_report:'+qid)
core.action(session, 'story_report:'+qid)
assert (q.status, q.cycles, session.mora, session.progression.questXp) == ('complete', 1, balance+500, xp+67646)
session = core.restore(lua.table_from(saved(), recursive=True))
assert core.frame(session).storyMarketOpen
walk(1270)
go(room)
assert core.frame(session).storyCleared and len(session.enemies) == 0
assert not core.frame(session).storyCartX and len(session.platforms) == base_platforms+1

(ROOT/'evidence/liyue-m03-lua.json').write_text(json.dumps({
    'M02_prerequisite': True, 'latch_elevation_required': True,
    'rail_moves_while_player_controls_remain_available': True, 'rail_pauses': True,
    'moving_cart_resumes_at_previous_committed_station': True,
    'released_bridge_reachable_with_normal_jump': True, 'changed_enemy_placements': True,
    'keeper_defeated_with_normal_attack': True, 'return_gate_opens_after_dispatch': True,
    'market_and_safe_revisit_persist': True, 'requires_beidou_join': False,
    'one_time_reward': {'xp': 67646, 'mora': 500},
}, indent=2)+'\n', encoding='utf8')
print('Liyue M03 rail, new platform and enemy phase, market, and checkpoint passed')
