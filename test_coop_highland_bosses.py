"""Shared White Pass and stopover boss attacks, credit, and local HTTP entry."""
import json
import subprocess
import sys

from experience import CHAPTER_CLEAR_EXP, LEVELS, QUEST_REPORT_EXP, RUNTIME_EXP
from runtime import ROOT, native, runtime
from savegame import validate_save
from test_coop_branch_legends import SPECS, actor_at, damage, hit, run_until
from test_coop_local import Client, LOCK, SESSIONS, advance, lab
from test_coop_ruin_guardians import QUESTS, balances, cross, edge, inspect, lua_cross


CASES = (
    ('original-frost-antler','white_pass_chapter','white-pass-summit',('white-pass-woods','white-pass-ridge')),
    ('original-rubble-sifter','cap_stopover','ochka-sifter-clear',('ochka-tide-stairs','ochka-patched-court')),
)
TICK=1/60


def start_players(lua,core,seed,q,path,arena):
    players=[core.restore(lua.table_from(seed,recursive=True),12) for _ in range(4)]
    for s in players:
        core.action(s,'story_accept:'+q)
        for node in (*path,arena):
            lua_cross(core,s,edge(s.story.node,node))
        s.actors[2].hp=0
    return players


def party_takeover(lua,core,players,spec):
    host,guest,upper,safe=players
    slot=host.fieldSlots[spec['id']]
    actor_at(host,spec['home']-120)
    single=lambda:core.step(host,TICK,lua.table())
    run_until(single,lambda:slot.cast and slot.cast.tick==slot.cast.move.windup-1)
    cast=slot.cast
    lane=cast.lanes[1] if cast.lanes else cast
    center=(lane.left+lane.right)/2
    actor_at(host,center)
    single()
    assert damage(host)==[(spec['entity'],cast.move.damage)]
    host.actors[1].inv=0
    room=core.newCoop(host)
    for s in players:
        core.attachCoop(room,s)
    actor_at(guest,center)
    actor_at(upper,center,spec['floorY']-cast.move.height-20)
    actor_at(safe,slot.enemy.x if cast.lanes else cast.right+40)
    core.stepCoop(room,TICK)
    assert [len(damage(s)) for s in players]==[1,1,0,0]
    assert all(core.frame(s).fieldBoss.hp==spec['hp'] for s in players)
    return room


def frost_attacks(lua,core,room,players):
    slot,boss=room.fieldSlot,room.fieldSlot.enemy
    step=lambda:core.stepCoop(room,TICK)
    run_until(step,lambda:boss.recovering)
    cast=lua.table_from({'id':1})
    spec=room.fieldSpec
    assert all(core.damageFactor(s,cast,boss,'physical')==spec.recoveryFactor for s in players)
    recovery=native(core.frame(players[0]).fieldBoss.recovery)
    assert 0<recovery['ticks']<=recovery['total'] and recovery['factor']==1.25
    assert all(native(core.frame(s).fieldBoss.recovery)==recovery for s in players)
    step()
    assert all(core.frame(s).fieldBoss.recovery.ticks==recovery['ticks']-1 for s in players)
    for s in players:
        actor_at(s,boss.x-125)
    run_until(step,lambda:slot.cast and slot.cast.move.id=='FR02')
    stomp=slot.cast
    assert all(native(core.frame(s).fieldBoss.lane)==native(core.frame(players[0]).fieldBoss.lane) for s in players)
    run_until(step,lambda:stomp.tick==stomp.move.windup-1)
    actor_at(players[0],boss.x)
    actor_at(players[1],boss.x,398)
    actor_at(players[2],stomp.left-40)
    actor_at(players[3],stomp.right+40)
    before=[len(damage(s)) for s in players]
    step()
    assert [len(damage(s))-n for s,n in zip(players,before)]==[1,0,0,0]
    for s in players:
        actor_at(s,boss.x-130)
    run_until(step,lambda:slot.cast and slot.cast.move.id=='FR03')
    charge=slot.cast
    run_until(step,lambda:charge.tick==charge.move.windup-1)
    for s,x,y in zip(players,(charge.destination,charge.origin,charge.origin,charge.right+38),(480,480,390,480)):
        actor_at(s,x,y).inv=0
    before=[len(damage(s)) for s in players]
    step()
    assert [len(damage(s))-n for s,n in zip(players,before)]==[0,1,0,0]
    lane=core.frame(players[0]).fieldBoss.lane
    assert lane.hitLeft<=boss.x<=lane.hitRight and not lane.hitLeft<=charge.destination<=lane.hitRight
    assert all(native(core.frame(s).fieldBoss.lane)==native(lane) for s in players)
    run_until(step,lambda:len(damage(players[0]))>before[0])
    assert damage(players[0])[-1]==(room.fieldSpec.entity,22)
    run_until(step,lambda:boss.recovering)
    assert boss.x==charge.destination
    return dict(moves=['FR01','FR02','FR03'],movingCharge=True,sharedRecoveryFactor=1.25)


def sifter_attacks(lua,core,room,players):
    slot,boss=room.fieldSlot,room.fieldSlot.enemy
    step=lambda:core.stepCoop(room,TICK)
    assert all(core.frame(s).fieldBoss.barrier==35 for s in players)
    actor_at(players[0],boss.x)
    hp=boss.hp
    hit(lua,core,players[0],boss,power=100)
    defended=hp-boss.hp
    run_until(step,lambda:boss.exposed)
    assert all(core.frame(s).fieldBoss.weakpoint.radius==37 for s in players)
    hp=boss.hp
    hit(lua,core,players[1],boss,power=100)
    exposed=hp-boss.hp
    assert (defended,exposed)==(9,123)
    for i,s in enumerate(players):
        actor_at(s,boss.x-44-i*22)
    run_until(step,lambda:slot.cast and slot.cast.move.id=='RK02')
    cast=slot.cast
    lanes=native(cast.lanes)
    assert [lane['at'] for lane in lanes]==[63,99,135]
    before=[len(damage(s)) for s in players]
    for i,lane in enumerate(lanes):
        run_until(step,lambda:cast.tick==lane['at']-1)
        center=(lane['left']+lane['right'])/2
        actor_at(players[0],center).inv=0
        for j,s in enumerate(players[1:]):
            x=center if j==i else max(l['right'] for l in lanes)+43
            actor_at(s,x).inv=0
        step()
        assert [len(damage(s))-n for s,n in zip(players,before)]==[1]+[int(j<=i) for j in range(3)]
        assert native(cast.lanes)==lanes
    run_until(step,lambda:boss.exposed)
    assert all(core.frame(s).fieldBoss.exposed for s in players)
    return dict(moves=['RK01','RK02'],heatTimes=[63,99,135],oneHitAcrossLanes=True,defendedHit=defended,rotorHit=exposed)


def shared_fight(id,q,path,seed):
    lua,core=runtime()
    spec=SPECS[id]
    quest=QUESTS[q]
    players=start_players(lua,core,seed,q,path,spec['node'])
    room=party_takeover(lua,core,players,spec)
    frost=spec['controller']=='frostAntler'
    battle=(frost_attacks if frost else sifter_attacks)(lua,core,room,players)
    boss=room.fieldSlot.enemy
    before=[balances(s) for s in players]
    for s in players:
        actor_at(s,boss.x)
    hit(lua,core,players[1],boss,power=9)
    hit(lua,core,players[0],boss,power=20000)
    assert [s.story.quests[q].count for s in players]==[1,1,0,0]
    xp=int(LEVELS[spec['level']-1]['normal_enemy_base_exp']*
           RUNTIME_EXP['roles'][spec.get('expRole','field_boss')]+.5)
    first=CHAPTER_CLEAR_EXP[quest['designId']+':BOSS_FIRST'] if frost else 0
    assert [tuple(a-b for a,b in zip(balances(s),old)) for s,old in zip(players,before)]==[
        (first,xp,spec['mora'],0)]*2+[(0,0,0,0)]*2
    report=(QUEST_REPORT_EXP.get(quest['designId'],quest['xp']),0,quest['mora'],quest.get('ore',0))
    for s in players[:2]:
        inspect(core,s,quest['itinerary'][1])
        for node in (*reversed(path),quest['hub']):
            lua_cross(core,s,edge(s.story.node,node))
        core.detachCoop(s.coopMember)
        prior=balances(s)
        for _ in range(2):
            core.action(s,'story_report:'+q)
        assert tuple(a-b for a,b in zip(balances(s),prior))==report
        saved=validate_save(native(core.checkpoint(s)))
        assert saved['endgame']['bosses'][id]['clears']==1
        restored=core.restore(lua.table_from(saved,recursive=True),12)
        assert restored.story.node==quest['hub'] and restored.story.quests[q].status=='complete'
    return dict(players=4,sharedHP=spec['hp'],midAttackJoinKeepsHits=True,battle=battle,
                rewardsOnlyForContributors=True,chapterClearExp=first,rewards=[xp,spec['mora']],report=list(report))


def http_fight(url,id,q,path,seed):
    spec=SPECS[id]
    arena=spec['node']
    frost=spec['controller']=='frostAntler'
    host,guest=Client(url),Client(url)
    for client in (host,guest):
        client.frame(restore=seed)
    code=host.frame(['coop_create'])['coop']['code']
    assert guest.frame(['coop_join:'+code])['coop']['code']==code
    host.frame(['story_accept:'+q])
    for client in (host,guest):
        node=QUESTS[q]['hub']
        for stop in path:
            cross(client,edge(node,stop))
            node=stop
    if frost:
        with LOCK:
            actor_at(SESSIONS[guest.sid]['state'],edge(node,arena)['x'])
        locked=guest.frame(['story_portal:'+arena])
        assert not locked['storyNearbyPortal']['available'] and locked['story']['node']==node
        for stop in (*reversed(path[:-1]),QUESTS[q]['hub']):
            cross(guest,edge(node,stop))
            node=stop
        guest.frame(['story_accept:'+q])
        for stop in path:
            cross(guest,edge(node,stop))
            node=stop
    for client in (host,guest):
        assert cross(client,edge(node,arena))['coop']['shared']
        with LOCK:
            SESSIONS[client.sid]['state'].actors[2].hp=0

    with LOCK:
        env=SESSIONS[host.sid]
        lua,core,state=env['lua'],env['core'],env['state']
        world=state.coop
        body=world.fieldSlot.enemy
        actor_at(state,body.x-55).atk=85
        state.actors[1].dir=1
    host.frame(['normal'])
    a,b=advance(host,guest,.42)
    hp=a['fieldBoss']['hp']
    assert 0<hp<spec['hp'] and b['fieldBoss']['hp']==hp
    for client in (host,guest):
        cross(client,edge(arena,node))
    paused=world.tick
    advance(host,guest,.13)
    assert world.tick==paused and body.hp==hp
    for client in (host,guest):
        cross(client,edge(node,arena))
    with LOCK:
        other=SESSIONS[guest.sid]['state']
        actor_at(other,body.x)
        hit(lua,core,other,body,power=8)
        actor_at(state,body.x)
        hit(lua,core,state,body,power=20000)
    a,b=[client.frame(checkpoint=True) for client in (host,guest)]
    assert all(f['checkpoint']['endgame']['bosses'][id]['clears']==1 for f in (a,b))
    assert a['story']['quests'][q]['count']==1
    assert (b['story']['quests'][q]['count']==1 if frost else q not in b['story']['quests'])
    with LOCK:
        for party in (state,other):
            actor_at(party,160)
        clock=lua.eval('function(C,room,dt,n) for _=1,n do C.stepCoop(room,dt) end end')
        remaining=round((world.fieldSlot.waitUntil-world.time)/TICK)
        clock(core,world,TICK,remaining-2)
        assert world.fieldSlot.enemy.hp==0
        clock(core,world,TICK,3)
        respawned=world.fieldSlot.enemy
        assert respawned.hp==spec['hp']
        for party in (state,other):
            actor_at(party,respawned.x)
        hit(lua,core,other,respawned,power=8)
        hit(lua,core,state,respawned,power=20000)
    for client,before in zip((host,guest),(a,b)):
        after=client.frame(checkpoint=True)
        assert after['progression']['questXp']==before['progression']['questXp']
        assert after['mora']==before['mora']+spec['mora']
        assert after['checkpoint']['endgame']['bosses'][id]['clears']==2
    return dict(players=2,questGateChecked=frost,unacceptedVisitorCanContribute=not frost,
                sharedHitAndRetreatHP=True,individualQuestCredit=True,rematchDoesNotRepeatChapterExp=True)


if __name__=='__main__':
    result={}
    for id,test,q,path in CASES:
        subprocess.run([sys.executable,'-X','utf8',str(ROOT/f'test_{test}.py')],check=True)
        seed=json.loads((ROOT/f'work/coop-{id}-fixture.json').read_text(encoding='utf8'))
        result[id]=dict(lua=shared_fight(id,q,path,seed))
        with lab() as url:
            result[id]['http']=http_fight(url,id,q,path,seed)
    (ROOT/'evidence/coop-highland-bosses-lua-http.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
    print(result)
