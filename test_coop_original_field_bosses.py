"""Shared attacks, personal story progress, and browser fixtures for original bosses."""
import json

from experience import LEVELS, RUNTIME_EXP
from runtime import ROOT, native, runtime
from savegame import validate_save
from test_coop_branch_legends import NODES, SPECS, actor_at, damage, hit, level, run_until


CASES = (
    ('original-rime-hare', 'spine-ridge-record', ()),
    ('original-tea-boulder', 'chenyu-tea-with-friends', ()),
    ('original-snow-sweeper', 'snow-rail-pressure', ('snezhnaya-field','snow-rail-transfer')),
    ('original-windward-tower', 'windward-tower-clear', ('dornman-flag-trestle',)),
)
quests = {q['id']: q for q in json.loads((ROOT/'content/story-graph.json').read_bytes())['quests']}
lua, core = runtime()
idle = lua.table()


def saved(state):
    return validate_save(native(core.checkpoint(state)))


def setup(quest, required_level):
    state = core.new(12)
    core.action(state, 'story_start')
    level(core, state, required_level)
    previous = quests[quest].get('requires')
    while previous:
        dependency = quests[previous]
        core.enterStoryNode(state, dependency['hub'])
        for objective in dependency.get('itinerary',[]):
            core.enterStoryNode(state, objective['node'])
            if objective.get('from'):
                core.enterStoryNode(state, objective['from'])
        if dependency.get('target'):
            core.enterStoryNode(state, dependency['target'])
        state.story.quests[previous] = lua.table_from({'status':'complete','count':dependency['goal'],'cycles':1})
        previous = dependency.get('requires')
    core.enterStoryNode(state, quests[quest]['hub'])
    return state


def move_through(state, target):
    edge = next(e for e in NODES[state.story.node]['exits'] if e['to']==target)
    actor_at(state, edge['x'], edge.get('y',480))
    core.action(state,'story_nearby_portal')
    assert state.story.node==target


def inspect(state, objective):
    assert state.story.node==objective['node']
    actor_at(state,objective['x'],objective['y'])
    core.action(state,'story_collect')


def rejected(state, target):
    edge = next(e for e in NODES[state.story.node]['exits'] if e['to']==target)
    actor_at(state,edge['x'],edge.get('y',480))
    portal = core.frame(state).storyNearbyPortal
    assert portal.to==target and not portal.available
    source = state.story.node
    core.action(state,'story_nearby_portal')
    assert state.story.node==source


def check_second_attack(room, players, spec):
    slot = room.fieldSlot
    boss = slot.enemy
    sweeper = spec['controller']=='snowSweeper'
    next_move = 'SR02' if sweeper else 'WDW02'
    step = lambda: core.stepCoop(room,1/60)
    for state in players:
        actor_at(state,boss.x+65)
    run_until(step,lambda: slot.cast and slot.cast.move.id==next_move)
    cast = slot.cast
    left, right = cast.left,cast.right
    center = (left+right)/2
    top = cast.top or spec['floorY']-cast.move.height
    run_until(step,lambda: cast.tick==cast.move.windup-1)
    actor_at(players[0],center)
    actor_at(players[1],center,top-15 if sweeper else spec['floorY']-90)
    actor_at(players[2],right+27)
    actor_at(players[3],left-27)
    before = [len(damage(s)) for s in players]
    step()
    received = [len(damage(s))-n for s,n in zip(players,before)]
    assert received==([1,0,0,0] if sweeper else [1,1,0,0])
    assert (cast.left,cast.right)==(left,right)
    run_until(step,lambda: boss.cooling or boss.exposed)
    return dict(attack=next_move,hits=received,sharedRecovery=all(
        core.frame(s).fieldBoss.cooling or core.frame(s).fieldBoss.exposed for s in players))


result = {}
for boss_id, quest, path in CASES:
    spec = SPECS[boss_id]
    arena = spec['node']
    hub = quests[quest]['hub']
    itinerary = quests[quest]['itinerary']
    boss_index = next(i for i, step in enumerate(itinerary) if step['kind']=='boss')
    below = setup(quest, spec['level']-1)
    for stop in path:
        move_through(below,stop)
    rejected(below,arena)
    fixture = setup(quest, spec['level'])
    (ROOT/f'work/coop-{boss_id}-fixture.json').write_text(json.dumps(saved(fixture)),encoding='utf8')
    players = [setup(quest, spec['level']) for _ in range(4)]
    host, guest, watcher, safe = players
    core.action(host,'story_accept:'+quest)
    assert host.story.quests[quest].status=='active'
    for index, state in enumerate(players):
        if boss_index and index:
            core.action(state,'story_accept:'+quest)
            assert state.story.quests[quest].status=='active'
        for stop in path:
            move_through(state,stop)
        if boss_index:
            rejected(state,arena)
            inspect(state,itinerary[0])
            assert state.story.quests[quest].count==1
        move_through(state, arena)
        state.actors[2].hp=0
        actor_at(state,spec['home']-154)
    slot = host.fieldSlots[boss_id]
    assert slot.enemy.hp==spec['hp']
    solo_step = lambda: core.step(host,1/60,idle)
    run_until(solo_step, lambda: slot.cast and slot.cast.tick==slot.cast.move.windup-1)
    cast = slot.cast
    if boss_id=='original-rime-hare':
        lane = cast.lanes[1]
        blocked_x, avoided_y = (lane.left+lane.right)/2, lane.top-12
        active_x = blocked_x
    elif boss_id=='original-tea-boulder':
        assert cast.left==645, native(core.frame(host).fieldBoss)
        active_x, blocked_x, avoided_y = 740, 601, 480
    else:
        active_x = cast.origin-20 if cast.origin is not None else (cast.left+cast.right)/2
        blocked_x = active_x
        avoided_y = (cast.top or spec['floorY']-cast.move.height)-18
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
    followup = None
    if boss_id in ('original-snow-sweeper','original-windward-tower'):
        if boss_id=='original-snow-sweeper':
            assert room.fieldSlot.enemy.x!=cast.origin
        run_until(lambda: core.stepCoop(room,1/60),
                  lambda: room.fieldSlot.enemy.cooling or room.fieldSlot.enemy.exposed)
        assert all(core.frame(s).fieldBoss.cooling or core.frame(s).fieldBoss.exposed for s in players)
        followup=check_second_attack(room,players,spec)
        assert followup['sharedRecovery']
    for state in players: actor_at(state,boss.x-50)
    hit(lua,core,guest,boss)
    hit(lua,core,host,boss,power=100000)
    assert boss.hp==0
    assert [s.mora for s in players]==[spec['mora'],spec['mora'],0,0]
    base_xp = LEVELS[spec['level']-1]['normal_enemy_base_exp']
    xp = int(base_xp*RUNTIME_EXP['roles']['field_boss']+.5)
    assert [s.progression.killXp for s in players]==[xp,xp,0,0]
    assert host.story.quests[quest].count==boss_index+1
    if boss_index:
        assert guest.story.quests[quest].count==boss_index+1
        assert all(s.story.quests[quest].count==boss_index for s in players[2:])
    else:
        assert guest.story.quests[quest] is None
    assert all(saved(s)['endgame']['bosses'][boss_id]['clears']==1 for s in players[:2])
    for objective in itinerary[boss_index+1:]:
        if objective['node']==arena:
            inspect(host,objective)
    for state, member in zip(players,members):
        for stop in reversed((hub,)+path):
            move_through(state,stop)
        core.detachCoop(member)
    for objective in itinerary[boss_index+1:]:
        if objective['node']!=arena:
            inspect(host,objective)
    assert host.story.quests[quest].count==quests[quest]['goal']
    before=host.mora
    for _ in range(2): core.action(host,'story_report:'+quest)
    assert host.mora-before==quests[quest]['mora']
    restored=core.restore(lua.table_from(saved(host),recursive=True),12)
    assert restored.story.node==hub and restored.story.quests[quest].status=='complete'
    assert restored.endgame.bosses[boss_id].clears==1
    result[boss_id] = dict(players=4, requiredLevel=spec['level'], sharedHP=spec['hp'], attack=cast.move.id,
                           hitOnJoin=[0,1,0,0], rewardedPlayers=2, xpPerContributor=xp,
                           personalSignalBox=bool(boss_index), questReportedAndRestored=True)
    if followup:
        result[boss_id]['secondAttack']=followup

(ROOT/'evidence/coop-original-field-bosses-lua.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
print('Original bosses: live joins, attack avoidance, contribution, personal quest rewards and saves passed.')
