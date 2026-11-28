"""Exercise shared Baptist telegraphs, aim, hits, rewards and element rotation."""
import json

from experience import LEVELS, RUNTIME_EXP
from runtime import ROOT, native, runtime
from savegame import validate_save
from test_coop_anemo import TICK, place, wait_cast
from test_coop_local import Client, LOCK, SESSIONS, advance, lab
from test_coop_travel import cross
from test_coop_tulpa import hit


HUB, ENTRY, ARENA = 'sumeru-hub', 'sumeru-entry', 'baptist-field-sanctuary'
BOSS, ENTITY, QUEST = 'boss-22100501', 22100501, 'baptist-commission'
LEVEL = LEVELS[73]
XP = LEVEL['normal_enemy_base_exp'] * RUNTIME_EXP['roles']['field_boss']
INITIAL, NEXT = ['pyro', 'cryo', 'electro'], ['cryo', 'hydro', 'pyro']


def make(core, accepted=False, node=ARENA):
    state = core.new(12)
    core.action(state, 'story_start')
    core.grantExp(state, LEVEL['maple_reference_total_exp_to_reach'], 'quest')
    core.enterStoryNode(state, HUB)
    if accepted:
        core.action(state, 'story_accept:'+QUEST)
    core.enterStoryNode(state, node)
    place(state, 720)
    return state


def hurts(state, since):
    return [(e.value, e.element) for e in state.events.values()
            if e.seq > since and e.kind == 'hurt' and e.target == ENTITY]


def warnings(core, state):
    return native(core.frame(state).fieldBoss.warnings)


def center(warning):
    return (warning['left']+warning['right'])/2


def run_lua():
    lua, core = runtime()
    states = [make(core, accepts) for accepts in (True, False, True, True)]
    host, guest, wall_owner, spectator = states
    room = core.newCoop(host)
    for state in states:
        core.attachCoop(room, state)
    slot, step = room.fieldSlot, lambda:core.stepCoop(room, TICK)
    boss = slot.enemy
    assert boss.hp == boss.maxhp == 1090
    assert all(list(core.frame(s).fieldBoss.elementSlots.values()) == INITIAL for s in states)

    wait_cast(step, slot, 'FIB01', 42)
    bolt, origin = slot.cast, slot.cast.origin
    assert bolt.dir == -1
    for s in states:
        place(s, origin+110)
    wait_cast(step, slot, 'FIB01', 80)
    assert bolt.dir == -1
    place(host, origin-112)
    place(guest, origin-131)
    wall_owner.rockWall = lua.table(x=origin-69, y=480, life=5, hp=16, maxhp=16)
    starts = [s.seq for s in states]
    wait_cast(step, slot, 'FIB01', 110)
    assert bolt.shots[1] and wall_owner.rockWall is None
    assert all(not hurts(s, seq) for s,seq in zip(states, starts))
    wait_cast(step, slot, 'FIB01', 158)
    assert bolt.shots[2] and hurts(host, starts[0]) == [(16,'pyro')]
    assert all(not hurts(s, seq) for s,seq in zip(states[1:], starts[1:]))

    wait_cast(step, slot, 'FIB02', 48)
    fall = warnings(core, host)
    assert fall == warnings(core, guest)
    assert [w['element'] for w in fall] == ['cryo']*3
    wait_cast(step, slot, 'FIB02', 107)
    for s,x in zip(states, (center(fall[0]), center(fall[0]), center(fall[0])+45, center(fall[1]))):
        place(s, x)
    starts = [s.seq for s in states]
    step()
    assert warnings(core, host)[0]['active'] and warnings(core, host) == warnings(core, guest)
    place(host, center(fall[0]))  # During the same window; immunity alone cannot hide a duplicate.
    wait_cast(step, slot, 'FIB02', 111)
    assert [hurts(s,seq) for s,seq in zip(states, starts)] == [[(20,'cryo')],[(20,'cryo')],[],[]]
    for s in states:
        place(s, boss.x-105)

    wait_cast(step, slot, 'FIB03', 60)
    rings = warnings(core, host)
    assert all(warnings(core, s)==rings for s in states)
    assert [w['element'] for w in rings] == INITIAL
    assert [w['order'] for w in rings] == [1,2,3]
    assert len(room.enemies)==1 and not boss.invulnerable
    assert hit(lua, core, host, boss)>0 and boss.hp<1090
    tagged = []
    for i,w in enumerate(rings):
        wait_cast(step, slot, 'FIB03', w['first']-1)
        for s in states:
            place(s, center(w)+66)
        place(states[i], center(w))
        starts = [s.seq for s in states]
        step()
        results = [hurts(s,seq) for s,seq in zip(states, starts)]
        assert results == [[(22,w['element'])] if j==i else [] for j in range(4)]
        tagged.append(results[i][0][1])
    wait_cast(step, slot, 'FIB03', 210)
    for state in states:
        bar = core.frame(state).fieldBoss
        assert bar.recovering and bar.label=='詠唱終了・反撃の隙'
    assert all(not warnings(core,s) for s in states)

    wait_cast(step, slot, 'FIB01', 84)
    old_cast = slot.cast
    assert old_cast.projectiles[1]
    for s in states:
        place(s,boss.x-105)
    assert hit(lua,core,guest,boss)>0
    assert hit(lua,core,host,boss,1600)>0
    assert slot.cast is None and slot.phase=='respawn' and slot.enemy.hp==0
    assert [(s.kills,s.mora,s.progression.killXp) for s in states] == [(1,255,XP)]*2+[(0,0,0)]*2
    assert host.story.quests[QUEST].count==1 and wall_owner.story.quests[QUEST].count==0
    starts = [s.seq for s in states]
    for _ in range(3599):
        step()
    assert all(not hurts(s, seq) for s,seq in zip(states,starts))
    assert slot.phase=='respawn'
    step()
    assert slot.generation==2 and slot.enemy.hp==1090
    assert list(slot.enemy.elementSlots.values())==NEXT
    for s in states:
        place(s,slot.enemy.x-112)
        assert list(core.frame(s).fieldBoss.elementSlots.values())==NEXT

    # Adopt an already active ring. Its solo owner must not be hit again.
    solo, new_guest = make(core), make(core)
    personal = solo.fieldSlots[BOSS]
    wait_cast(lambda:core.step(solo,TICK,lua.table()), personal,'FIB03',119)
    x = center(warnings(core,solo)[0])
    place(solo,x)
    core.step(solo,TICK,lua.table())
    assert hurts(solo,0)[-1]==(22,'pyro')
    adopted = core.newCoop(solo)
    for s in (solo,new_guest):
        core.attachCoop(adopted,s)
        place(s,x)
    starts = [s.seq for s in (solo,new_guest)]
    core.stepCoop(adopted,TICK)
    assert [hurts(s,seq) for s,seq in zip((solo,new_guest),starts)]==[[],[(22,'pyro')]]
    assert adopted.fieldSlot.cast.tick==121

    checkpoint = validate_save(native(core.checkpoint(make(core, True, HUB))))
    (ROOT/'work/coop-baptist-fixture.json').write_text(json.dumps(checkpoint),encoding='utf-8')
    return {'bossHp':1090,'players':4,'initialElements':INITIAL,'respawnElements':NEXT,
            'allyWallBlocksWholeBolt':True,'secondBoltHitsOneParty':True,
            'sameAreaHitsSeparatePartiesOnce':True,'ringTags':tagged,
            'attackableDuringRings':True,'recoveryShared':True,
            'soloToRoomMigratesHitHistory':True,'pendingBoltClearedOnKill':True,
            'respawnTicks':3600,'killXp':XP,'killMora':255}


def run_http(url):
    a,b = Client(url),Client(url)
    for client in (a,b):
        client.frame(['story_start'])
        with LOCK:
            env = SESSIONS[client.sid]
            core,state = env['core'],env['state']
            core.grantExp(state,LEVEL['maple_reference_total_exp_to_reach'],'quest')
            core.enterStoryNode(state,HUB)
            state.actors[2].hp=0
            if client is a:
                core.action(state,'story_accept:'+QUEST)
        cross(client,60,ENTRY)
    code = a.frame(['coop_create'])['coop']['code']
    assert b.frame(['coop_join:'+code])['coop']['code']==code
    for client in (a,b):
        assert cross(client,510,ARENA)['coop']['code']==code
    with LOCK:
        h,g = [SESSIONS[c.sid] for c in (a,b)]
        core,lua = h['core'],h['lua']
        world = h['coop_room'].worlds[ARENA]
        for env in (h,g):
            place(env['state'],720)
        wait_cast(lambda:core.stepCoop(world,TICK),world.fieldSlot,'FIB03',63)
    fa,fb = a.frame(),b.frame()
    announced = fa['fieldBoss']['warnings']
    assert announced==fb['fieldBoss']['warnings']
    for client in (a,b):
        assert cross(client,65,ENTRY)['coop']['shared']
    with LOCK:
        stopped = (world.tick,world.fieldSlot.cast.tick)
    advance(a,b,.2)
    assert (world.tick,world.fieldSlot.cast.tick)==stopped
    for client in (a,b):
        cross(client,510,ARENA)
    with LOCK:
        boss = world.fieldSlot.enemy
        for env in (h,g):
            place(env['state'],boss.x-105)
            assert warnings(core,env['state'])==announced
        assert hit(lua,core,h['state'],boss)>0
        assert hit(lua,core,g['state'],boss,1600)>0
    fa,fb = [c.frame(checkpoint=True) for c in (a,b)]
    for f in (fa,fb):
        assert f['coop']['code']==code and f['kills']==1 and f['mora']==255
        assert f['fieldBoss']['phase']=='respawn' and 'warnings' not in f['fieldBoss']
        assert f['checkpoint']['endgame']['bosses'][BOSS]['clears']==1
        assert f['checkpoint']['fieldBosses'][BOSS]['waitTicks']>0
    assert fa['story']['quests'][QUEST]['count']==1 and QUEST not in fb['story']['quests']
    return {'participants':2,'sameRoomFromEntryToArena':True,'sameWarningsAndElements':True,
            'vacantArenaPreservesCast':True,'individualSavedClears':True,'onlyAcceptedQuestAdvanced':True}


if __name__=='__main__':
    result={'lua':run_lua()}
    with lab() as url:
        result['http']=run_http(url)
    (ROOT/'evidence/coop-baptist-lua-http.json').write_text(
        json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(result,ensure_ascii=False))
