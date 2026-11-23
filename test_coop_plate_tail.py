"""Check Enkanomiya's shared boss and personal lamp route in Lua and HTTP."""
import json
import subprocess
import sys

from runtime import ROOT, native, runtime
from test_coop_branch_legends import SPECS, actor_at, damage, hit, run_until
from test_coop_late_branch_bosses import difference, normal_rewards, report_rewards
from test_coop_local import Client, LOCK, SESSIONS, advance, lab
from test_coop_ruin_guardians import QUESTS, TICK, balances, cross, edge, inspect, lua_cross


BOSS='original-plate-tail'
QUEST='enkan-coverless-log'
CAMP='enkanomiya-camp'
LAMP='enkan-lamp-chamber'
GALLERY='enkan-route-gallery'
HOLLOW='enkan-tablet-hollow'
LIGHT_QUEST='enkan-shadow-crossing'


def live_charge(lua,core,seed):
    spec,quest=SPECS[BOSS],QUESTS[QUEST]
    players=[core.restore(lua.table_from(seed,recursive=True),12) for _ in range(4)]
    for player in players:
        core.action(player,'story_accept:'+QUEST)
        lua_cross(core,player,edge(GALLERY,HOLLOW))
        player.actors[2].hp=0

    host,guest,above,sheltered=players
    slot=host.fieldSlots[BOSS]
    boss=slot.enemy
    solo=lambda:core.step(host,TICK,lua.table())
    actor_at(host,606)
    run_until(solo,lambda:slot.cast and slot.cast.tick==slot.cast.move.windup-1)
    cast=slot.cast
    assert cast.move.id=='PT01' and cast.stopped and cast.left==650 and cast.finish==708
    actor_at(host,cast.origin-28)
    solo()
    assert damage(host)==[(spec['entity'],cast.move.damage)]
    host.actors[1].inv=0
    room=core.newCoop(host)
    for player in players:
        core.attachCoop(room,player)
    step=lambda:core.stepCoop(room,TICK)
    actor_at(guest,boss.x)
    actor_at(above,boss.x,cast.top-10)
    actor_at(sheltered,606)
    step()
    assert [len(damage(s)) for s in players]==[1,1,0,0]
    lane=native(core.frame(host).fieldBoss.lane)
    assert all(native(core.frame(s).fieldBoss.lane)==lane for s in players)
    assert lane['hitRight']>boss.x+cast.move.radius and lane['hitLeft']>cast.finish

    closed=boss.hp
    hit(lua,core,host,boss,power=100)
    closed-=boss.hp
    for player in (host,guest,above):
        actor_at(player,606)
    run_until(step,lambda:boss.stopped)
    assert boss.x==708 and all(core.frame(s).fieldBoss.barrier==0 for s in players)
    opened=boss.hp
    actor_at(host,boss.x)
    hit(lua,core,host,boss,power=100)
    opened-=boss.hp
    assert (closed,opened)==(9,118), (closed,opened)
    regular_end=cast.move.windup+cast.move.active+cast.move.recovery
    run_until(step,lambda:cast.tick==regular_end)
    assert boss.stopped
    run_until(step,lambda:slot.cast is None)
    assert cast.tick==regular_end+spec['rockRecovery'] and boss.barrier==10

    for player in players:
        actor_at(player,boss.x+70)
    run_until(step,lambda:slot.cast and slot.cast.move.id=='PT02')
    sweep=slot.cast
    run_until(step,lambda:sweep.tick==sweep.move.windup-1)
    for player,x,y in zip(players,(boss.x,boss.x,boss.x,sweep.right+36),(480,480,395,480)):
        actor_at(player,x,y)
    old=[len(damage(s)) for s in players]
    step()
    assert [len(damage(s))-n for s,n in zip(players,old)]==[1,1,0,0]
    run_until(step,lambda:boss.exposed)
    assert not boss.stopped

    old=[balances(s) for s in players]
    actor_at(guest,boss.x)
    hit(lua,core,guest,boss,power=35)
    actor_at(host,boss.x)
    hit(lua,core,host,boss,power=10000)
    reward=normal_rewards(spec)
    assert [difference(balances(s),prior) for s,prior in zip(players,old)]==[reward]*2+[(0,0,0,0)]*2
    assert [s.story.quests[QUEST].count for s in players]==[1,1,0,0]
    report=report_rewards(quest)
    for player in (host,guest):
        inspect(core,player,quest['itinerary'][1])
        lua_cross(core,player,edge(HOLLOW,GALLERY))
        core.detachCoop(player.coopMember)
        inspect(core,player,quest['itinerary'][2])
        previous=balances(player)
        for _ in range(2):
            core.action(player,'story_report:'+QUEST)
        assert difference(balances(player),previous)==report
        restored=core.restore(core.checkpoint(player),12)
        assert restored.story.node==GALLERY and restored.story.quests[QUEST].status=='complete'
        inspect(core,restored,quest['itinerary'][2])
        assert '同じ道で小間へ戻る' in restored.storyNotice
    return dict(players=4,sharedHP=spec['hp'],moves=['PT01','PT02'],leftStop=cast.finish,
                sameSweptHitbox=True,rockAndHeightAvoidDamage=True,
                hitHistoryPreservedOnRoomCreation=True,extraRecoveryTicks=spec['rockRecovery'],
                closedHit=closed,exposedHit=opened,rewards=list(reward),report=list(report))


def right_rock(lua,core,seed):
    state=core.restore(lua.table_from(seed,recursive=True),12)
    lua_cross(core,state,edge(GALLERY,HOLLOW))
    state.actors[2].hp=0
    actor_at(state,1195)
    room=core.newCoop(state)
    core.attachCoop(room,state)
    slot=room.fieldSlot
    step=lambda:core.stepCoop(room,TICK)
    run_until(step,lambda:slot.cast)
    cast=slot.cast
    assert cast.move.id=='PT01' and cast.stopped and cast.right==1300 and cast.finish==1242
    actor_at(state,1354)
    run_until(step,lambda:slot.enemy.stopped)
    assert slot.enemy.x==1242 and not damage(state)
    return cast.finish


def move(client,x,y=480):
    with LOCK:
        actor_at(SESSIONS[client.sid]['state'],x,y)


def http_route(url,seed):
    host,guest=Client(url),Client(url)
    for client in (host,guest):
        client.frame(restore=seed)
    code=host.frame(['coop_create'])['coop']['code']
    assert guest.frame(['coop_join:'+code])['coop']['code']==code
    for client in (host,guest):
        entered=cross(client,edge(CAMP,LAMP))
        assert entered['coop']['code']==code and not entered['coop']['shared']
        assert entered['storyLocalLight']['mode']=='bright'
    move(host,224)
    dark=host.frame(['story_collect'])
    bright=guest.frame()
    assert (dark['storyLocalLight']['mode'],len(dark['platforms']))==('dark',3)
    assert (bright['storyLocalLight']['mode'],len(bright['platforms']))==('bright',2)
    move(host,647,390)
    assert host.frame(['story_collect'])['story']['quests'][LIGHT_QUEST]['count']==2
    lamp_exit=edge(LAMP,GALLERY)
    assert cross(host,lamp_exit)['coop']['shared']
    move(guest,lamp_exit['x'],lamp_exit['y'])
    waiting=guest.frame(['story_portal:'+GALLERY])
    assert waiting['story']['node']==LAMP and waiting['story']['quests'][LIGHT_QUEST]['count']==1
    assert not waiting['storyNearbyPortal']['available']
    move(guest,224)
    guest.frame(['story_collect'])
    move(guest,647,390)
    guest.frame(['story_collect'])
    assert cross(guest,lamp_exit)['coop']['shared']

    light=QUESTS[LIGHT_QUEST]
    for client in (host,guest):
        move(client,light['itinerary'][-1]['x'])
        client.frame(['story_collect'])
        cross(client,edge(GALLERY,CAMP))
        assert client.frame(['story_report:'+LIGHT_QUEST])['story']['quests'][LIGHT_QUEST]['status']=='complete'
        assert cross(client,edge(CAMP,GALLERY))['coop']['shared']
    host.frame(['story_accept:'+QUEST])
    for client in (host,guest):
        assert cross(client,edge(GALLERY,HOLLOW))['coop']['shared']

    with LOCK:
        env=SESSIONS[host.sid]
        lua,core,state=env['lua'],env['core'],env['state']
        other=SESSIONS[guest.sid]['state']
        for player in (state,other):
            player.actors[2].hp=0
        world=state.coop
        body=world.fieldSlot.enemy
        actor_at(state,body.x-55).atk=70
        state.actors[1].dir=1
    host.frame(['normal'])
    first,second=advance(host,guest,.42)
    hp=first['fieldBoss']['hp']
    assert 0<hp<SPECS[BOSS]['hp'] and second['fieldBoss']['hp']==hp
    for client in (host,guest):
        cross(client,edge(HOLLOW,GALLERY))
    paused=world.tick
    advance(host,guest,.12)
    assert world.tick==paused and body.hp==hp
    for client in (host,guest):
        assert cross(client,edge(GALLERY,HOLLOW))['coop']['shared']

    with LOCK:
        actor_at(other,body.x)
        hit(lua,core,other,body,power=30)
        actor_at(state,body.x)
        hit(lua,core,state,body,power=20000)
    first,second=[c.frame(checkpoint=True) for c in (host,guest)]
    assert first['story']['quests'][QUEST]['count']==1 and QUEST not in second['story']['quests'], (
        first['story']['quests'].get(QUEST),second['story']['quests'].get(QUEST),
        first['fieldBoss']['hp'],second['fieldBoss']['hp'])
    assert all(view['checkpoint']['endgame']['bosses'][BOSS]['clears']==1 for view in (first,second))
    assert all(view['mora']==light['mora']+QUESTS['enkan-safety-leaflet']['mora']+SPECS[BOSS]['mora']
               for view in (first,second))
    quest=QUESTS[QUEST]
    move(host,quest['itinerary'][1]['x'])
    host.frame(['story_collect'])
    cross(host,edge(HOLLOW,GALLERY))
    move(host,quest['itinerary'][2]['x'])
    host.frame(['story_collect'])
    reported=host.frame(['story_report:'+QUEST],checkpoint=True)
    assert host.frame(['story_report:'+QUEST])['mora']==reported['mora']
    host.frame(restore=reported['checkpoint'])
    move(host,quest['itinerary'][2]['x'])
    saved=host.frame(['story_collect'])
    assert saved['story']['quests'][QUEST]['status']=='complete'
    assert '同じ道で小間へ戻る' in saved['storyNotice']
    return dict(players=2,personalLightAndBridge=True,retainedRoomThroughLamp=True,
                individualDarkExitGate=True,sharedHPAfterReturning=True,
                unacceptedGuestKeepsKillOnly=True,reportAndLogRestored=True)


if __name__=='__main__':
    subprocess.run([sys.executable,'-X','utf8',str(ROOT/'test_enkan_lamp_route.py')],check=True)
    seed=json.loads((ROOT/'work/coop-original-plate-tail-fixture.json').read_bytes())
    lamp=json.loads((ROOT/'work/coop-enkan-lamp-fixture.json').read_bytes())
    lua,core=runtime()
    shared=live_charge(lua,core,seed)
    shared['rightStop']=right_rock(lua,core,seed)
    with lab() as url:
        result={BOSS:dict(lua=shared,http=http_route(url,lamp))}
    (ROOT/'evidence/coop-plate-tail-lua-http.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
    print(result)
