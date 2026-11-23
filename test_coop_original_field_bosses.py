"""Shared attacks, personal story progress, and browser fixtures for two original bosses."""
import json

from experience import LEVELS, RUNTIME_EXP
from runtime import ROOT, native, runtime
from savegame import validate_save
from test_coop_branch_legends import NODES, SPECS, actor_at, damage, hit, level, run_until


CASES = (
    ('original-rime-hare', 'spine-shelter', 'spine-ridge-record'),
    ('original-tea-boulder', 'chenyu-tea-pavilion', 'chenyu-tea-with-friends'),
)
quests = {q['id']: q for q in json.loads((ROOT/'content/story-graph.json').read_bytes())['quests']}
lua, core = runtime()
idle = lua.table()


def saved(state):
    return validate_save(native(core.checkpoint(state)))


def setup(hub, quest, required_level):
    state = core.new(12)
    core.action(state, 'story_start')
    level(core, state, required_level)
    previous = quests[quest].get('requires')
    while previous:
        dependency = quests[previous]
        core.enterStoryNode(state, dependency['hub'])
        for objective in dependency['itinerary']:
            core.enterStoryNode(state, objective['node'])
        state.story.quests[previous] = lua.table_from({'status':'complete','count':dependency['goal'],'cycles':1})
        previous = dependency.get('requires')
    core.enterStoryNode(state, hub)
    return state


def move_through(state, target):
    edge = next(e for e in NODES[state.story.node]['exits'] if e['to']==target)
    actor_at(state, edge['x'], edge.get('y',480))
    core.action(state,'story_nearby_portal')
    assert state.story.node==target


result = {}
for boss_id, hub, quest in CASES:
    spec = SPECS[boss_id]
    arena = spec['node']
    below = setup(hub, quest, spec['level']-1)
    approach = next(e for e in NODES[hub]['exits'] if e['to']==arena)
    actor_at(below,approach['x'],approach.get('y',480))
    assert not core.frame(below).storyNearbyPortal.available
    core.action(below,'story_nearby_portal')
    assert below.story.node==hub
    fixture = setup(hub, quest, spec['level'])
    (ROOT/f'work/coop-{boss_id}-fixture.json').write_text(json.dumps(saved(fixture)),encoding='utf8')
    players = [setup(hub, quest, spec['level']) for _ in range(4)]
    host, guest, watcher, safe = players
    core.action(host,'story_accept:'+quest)
    assert host.story.quests[quest].status=='active'
    for state in players:
        move_through(state, arena)
        state.actors[2].hp=0
        actor_at(state, spec['home']-154)
    slot = host.fieldSlots[boss_id]
    assert slot.enemy.hp==spec['hp']
    solo_step = lambda: core.step(host,1/60,idle)
    run_until(solo_step, lambda: slot.cast and slot.cast.tick==slot.cast.move.windup-1)
    cast = slot.cast
    if boss_id=='original-rime-hare':
        lane = cast.lanes[1]
        blocked_x, avoided_y = (lane.left+lane.right)/2, lane.top-12
        active_x = blocked_x
    else:
        assert cast.left==645, native(core.frame(host).fieldBoss)
        active_x, blocked_x, avoided_y = 740, 601, 480
    actor_at(host,active_x)
    solo_step()
    assert damage(host)==[(spec['entity'],cast.move.damage)]
    room = core.newCoop(host)
    members = [core.attachCoop(room,s) for s in players]
    assert room.fieldSlot.enemy.hp==spec['hp']
    actor_at(host,active_x)
    actor_at(guest,active_x)
    actor_at(watcher,spec['home']+315)
    actor_at(safe,blocked_x,avoided_y)
    before = [len(damage(s)) for s in players]
    core.stepCoop(room,1/60)
    assert [len(damage(s))-n for s,n in zip(players,before)]==[0,1,0,0]
    boss=room.fieldSlot.enemy
    assert all(core.frame(s).fieldBoss.hp==spec['hp'] for s in players)
    assert all(core.frame(s).fieldBoss.tick==cast.tick for s in players)
    assert all(core.frame(s).fieldBoss.maxhp==spec['hp'] for s in players)
    for state in players: actor_at(state,boss.x-50)
    hit(lua,core,guest,boss)
    hit(lua,core,host,boss,power=100000)
    assert boss.hp==0
    assert [s.mora for s in players]==[spec['mora'],spec['mora'],0,0]
    base_xp = LEVELS[spec['level']-1]['normal_enemy_base_exp']
    xp = int(base_xp*RUNTIME_EXP['roles']['field_boss']+.5)
    assert [s.progression.killXp for s in players]==[xp,xp,0,0]
    assert host.story.quests[quest].count==1 and guest.story.quests[quest] is None
    assert all(saved(s)['endgame']['bosses'][boss_id]['clears']==1 for s in players[:2])
    for state, member in zip(players,members):
        move_through(state,hub)
        core.detachCoop(member)
    for objective in quests[quest]['itinerary'][1:]:
        if host.story.node!=objective['node']:
            move_through(host,objective['node'])
        actor_at(host,objective['x'],objective['y'])
        core.action(host,'story_collect')
    assert host.story.quests[quest].count==quests[quest]['goal']
    before=host.mora
    for _ in range(2): core.action(host,'story_report:'+quest)
    assert host.mora-before==quests[quest]['mora']
    restored=core.restore(lua.table_from(saved(host),recursive=True),12)
    assert restored.story.node==hub and restored.story.quests[quest].status=='complete'
    assert restored.endgame.bosses[boss_id].clears==1
    result[boss_id] = dict(players=4, requiredLevel=spec['level'], sharedHP=spec['hp'], attack=cast.move.id,
                           hitOnJoin=[0,1,0,0], rewardedPlayers=2, xpPerContributor=xp,
                           questReportedAndRestored=True)

(ROOT/'evidence/coop-original-field-bosses-lua.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
print('Original bosses: live joins, attack avoidance, contribution, personal quest rewards and saves passed.')
