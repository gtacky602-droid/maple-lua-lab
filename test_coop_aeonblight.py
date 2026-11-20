"""Exercise shared Drake weak-point interruption, flight and individual rewards."""
import json

from experience import LEVELS, RUNTIME_EXP
from runtime import ROOT, native, runtime
from savegame import validate_save
from test_coop_anemo import TICK, place, wait_cast
from test_coop_local import Client, LOCK, SESSIONS, advance, lab
from test_coop_travel import cross


HUB, ROAD, ARENA = 'sumeru-hub', 'sumeru-field', 'aeonblight-field-chamber'
BOSS, ENTITY, QUEST = 'boss-24030301', 24030301, 'aeonblight-commission'
LEVEL = LEVELS[65]
XP = LEVEL['normal_enemy_base_exp'] * RUNTIME_EXP['roles']['field_boss']


def initial_state(core, accepted=False, node=ARENA):
    state = core.new(12)
    core.action(state, 'story_start')
    core.grantExp(state, LEVEL['maple_reference_total_exp_to_reach'], 'quest')
    core.enterStoryNode(state, HUB)
    if accepted:
        core.action(state, 'story_accept:' + QUEST)
    core.enterStoryNode(state, node)
    place(state, 690)
    return state


def strike(lua, body, x, direction, **settings):
    return lua.table_from(dict(id=1, atk=20, x=x, y=480, dir=direction, range=125, limit=1,
                               mult=1, element='physical', color='#fff0ac', gain=0, critRate=0,
                               targetId=body.id) | settings)


def hurts(state, since):
    return [e.value for e in state.events.values()
            if e.seq > since and e.kind == 'hurt' and e.target == ENTITY]


def run_lua():
    lua, core = runtime()
    states = [initial_state(core, i == 0 or i == 2) for i in range(4)]
    host, guest, observer, other = states
    room = core.newCoop(host)
    for s in states:
        core.attachCoop(room, s)
    slot, step = room.fieldSlot, lambda:core.stepCoop(room,TICK)
    boss = slot.enemy
    assert boss.hp == boss.maxhp == 1310

    wait_cast(step, slot, 'FAD01', 95)
    wings = slot.cast
    for s,x in zip(states, (boss.x-92, boss.x-92, boss.x+92, boss.x-260)):
        place(s,x)
    marks=[s.seq for s in states]
    step()
    place(host,boss.x-92)
    wait_cast(step, slot, 'FAD01', 101)
    assert [hurts(s,seq) for s,seq in zip(states,marks)]==[[20],[20],[],[]]
    assert len(list(wings.seen[1].keys()))==2

    wait_cast(step, slot, 'FAD02', 48)
    for s in states:
        place(s, boss.x+slot.cast.dir*195)
    wait_cast(step, slot, 'FAD02', 94)
    cannon = slot.cast
    point = native(boss.weakpoint)
    assert point and cannon.projectiles[1] and not cannon.shots[1]
    assert all(native(core.frame(s).fieldBoss.weakpoint)==point for s in states)
    direction = cannon.dir
    place(guest,boss.x-direction*120)
    body_only = strike(lua,boss,guest.actors[1].x,direction)
    assert not core.hitFieldWeakpoint(body_only,boss)
    core.resolveCast(guest, body_only)
    assert boss.hp==1291 and native(boss.weakpoint)==point and boss.stagger==0

    place(host,boss.x+direction*155)
    core_only = strike(lua,boss,host.actors[1].x,-direction)
    assert abs(host.actors[1].x-boss.x)>core_only.range and core.hitFieldWeakpoint(core_only,boss)
    core.resolveCast(host,core_only)
    assert boss.hp==1272 and boss.stagger==150 and slot.cast is None
    assert all(core.frame(s).fieldBoss.downTicks==150 and core.frame(s).fieldBoss.weakpoint is None for s in states)
    ground = strike(lua,boss,guest.actors[1].x,direction)
    core.resolveCast(guest,ground)
    assert boss.hp==1253 and boss.stagger==150
    marks=[s.seq for s in states]
    for _ in range(149):
        step()
    assert boss.stagger==1 and slot.cast is None and all(not hurts(s,seq) for s,seq in zip(states,marks))
    step()
    assert (boss.stagger,boss.rise,boss.coreRearm)==(0,24,1200)
    for _ in range(24):
        step()
    assert (boss.rise,boss.coreRearm)==(0,1176)

    wait_cast(step,slot,'FAD03',102)
    assert all(core.frame(s).fieldBoss.flying and core.frame(s).fieldBoss.y==408 for s in states)
    force=1253
    for s in (host,guest):
        place(s,boss.x-90)
        core.resolveCast(s,strike(lua,boss,boss.x-90,1,atk=1800))
    assert boss.hp==force and slot.phase=='combat'
    wait_cast(step,slot,'FAD03',168)
    assert all(not core.frame(s).fieldBoss.flying for s in states)
    for s in states:
        place(s,boss.x-105)
    core.resolveCast(guest,strike(lua,boss,guest.actors[1].x,1,atk=1800))
    assert slot.phase=='respawn' and slot.cast is None and boss.hp==0
    assert [(s.kills,s.mora,s.progression.killXp) for s in states]==[(1,235,XP)]*2+[(0,0,0)]*2
    assert host.story.quests[QUEST].count==1 and observer.story.quests[QUEST].count==0
    for s in (host,guest):
        saved=validate_save(native(core.checkpoint(s)))
        assert saved['fieldBosses'][BOSS]['waitTicks']==3600
        assert saved['endgame']['bosses'][BOSS]['clears']==1

    # Joining an in-progress swing preserves the solo host's hit history only.
    solo, newcomer = initial_state(core), initial_state(core)
    personal=solo.fieldSlots[BOSS]
    wait_cast(lambda:core.step(solo,TICK,lua.table()),personal,'FAD01',96)
    assert hurts(solo,0)==[20]
    adopted=core.newCoop(solo)
    for s in (solo,newcomer):
        core.attachCoop(adopted,s)
        place(s,personal.enemy.x-100)
    marks=[s.seq for s in (solo,newcomer)]
    core.stepCoop(adopted,TICK)
    assert [hurts(s,seq) for s,seq in zip((solo,newcomer),marks)]==[[],[20]]

    fixture=validate_save(native(core.checkpoint(initial_state(core,True,HUB))))
    (ROOT/'work/coop-aeonblight-fixture.json').write_text(json.dumps(fixture),encoding='utf-8')
    return {'players':4,'bossHp':1310,'sharedWingHitOncePerParty':True,'soloSwingAdoption':True,
            'bodyHitKeepsCannon':True,'coreOnlyDamage':19,'coreStrikeCancelsLiveShell':True,
            'downTicks':150,'riseTicks':24,'rearmTicks':1200,'airPeakY':408,'groundAttackMissesPeak':True,
            'coreAttackerAndGroundAttackerCredited':True,'spectatorsNotCredited':True,'xp':XP,'mora':235}


def run_http(url):
    host, guest = Client(url), Client(url)
    clients=(host,guest)
    for client in clients:
        client.frame(['story_start'])
        with LOCK:
            env=SESSIONS[client.sid]
            core,state=env['core'],env['state']
            core.grantExp(state,LEVEL['maple_reference_total_exp_to_reach'],'quest')
            core.enterStoryNode(state,HUB)
            state.actors[2].hp=0
            if client is host:
                core.action(state,'story_accept:'+QUEST)
        cross(client,1380,ROAD)
    code=host.frame(['coop_create'])['coop']['code']
    assert guest.frame(['coop_join:'+code])['coop']['code']==code
    for client in clients:
        assert cross(client,480,ARENA)['coop']['code']==code
    with LOCK:
        h,g=[SESSIONS[c.sid] for c in clients]
        core,lua=h['core'],h['lua']
        world=h['coop_room'].worlds[ARENA]
        slot=world.fieldSlot
        for env in (h,g):
            place(env['state'],690)
        wait_cast(lambda:core.stepCoop(world,TICK),slot,'FAD02',56)
        boss=slot.enemy
        direction=slot.cast.dir
    a,b=[c.frame() for c in clients]
    assert a['fieldBoss']['weakpoint']==b['fieldBoss']['weakpoint']
    with LOCK:
        place(h['state'],boss.x+direction*155)
        core.resolveCast(h['state'],strike(lua,boss,h['state'].actors[1].x,-direction))
    for c in clients:
        f=c.frame()
        assert f['fieldBoss']['downTicks']>0 and f['fieldBoss']['hp']==1291
        assert 'weakpoint' not in f['fieldBoss'] and 'move' not in f['fieldBoss']
        assert cross(c,65,ROAD)['coop']['code']==code
    frozen=(world.tick,boss.stagger)
    advance(host,guest,.18)
    assert (world.tick,boss.stagger)==frozen
    for c in clients:
        cross(c,480,ARENA)
    with LOCK:
        assert 0<boss.stagger<=frozen[1]
        for env in (h,g):
            place(env['state'],boss.x-94)
        core.resolveCast(g['state'],strike(lua,boss,boss.x-94,1,atk=1800))
    a,b=[c.frame(checkpoint=True) for c in clients]
    assert all(f['kills']==1 and f['mora']==235 and f['fieldBoss']['phase']=='respawn'
               and f['checkpoint']['endgame']['bosses'][BOSS]['clears']==1 for f in (a,b))
    assert a['story']['quests'][QUEST]['count']==1 and QUEST not in b['story']['quests']
    return {'participants':2,'sameRoomFromRoadToChamber':True,'sameExposedCoreAndDown':True,
            'emptyRoomPreservesDownTimer':True,'bothSavedOneClear':True,'onlyAcceptedQuestAdvanced':True}


if __name__=='__main__':
    result={'lua':run_lua()}
    with lab() as url:
        result['http']=run_http(url)
    (ROOT/'evidence/coop-aeonblight-lua-http.json').write_text(
        json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(result,ensure_ascii=False))
