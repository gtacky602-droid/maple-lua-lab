"""Exercise the shared sunset duel, individual quest rewards and practice rooms."""
import json
import subprocess
import sys

from experience import CHAPTER_CLEAR_EXP, QUEST_REPORT_EXP
from runtime import ROOT, native, runtime
from savegame import validate_save
from test_coop_branch_legends import actor_at, damage, hit, run_until
from test_coop_local import Client, LOCK, SESSIONS, advance, lab


HUB,MEET,REVIEW,ARENA,ROSTRUM=('natlan-hub','natlan-duel-entry','natlan-sunset-review',
    'natlan-sunset-arena','natlan-sunset-rostrum')
BOSS,QUEST='original-river-racer','natlan-sunset-duel'
CLEAR=CHAPTER_CLEAR_EXP['Q-NAT-M03:BOSS_FIRST']
REPORT=QUEST_REPORT_EXP['Q-NAT-M03']
TICK=1/60


def place_and_act(core,s,x,action,y=480):
    actor_at(s,x,y)
    core.action(s,action)


def enter(core,s,x,node,y=480):
    place_and_act(core,s,x,'story_portal:'+node,y)
    assert s.story.node==node


def balances(s):
    return (s.progression.questXp,s.progression.killXp,s.mora,s.inventory.upgradeOre)


def prepare_fight(core,s):
    core.action(s,'story_accept:'+QUEST)
    enter(core,s,1314,MEET)
    place_and_act(core,s,418,'story_collect')
    enter(core,s,1240,REVIEW)
    place_and_act(core,s,801,'story_collect',390)
    enter(core,s,1412,ARENA,390)
    s.actors[2].hp=0


def join_after_splash(lua,core,seed):
    host,guest=[core.restore(lua.table_from(seed,recursive=True),12) for _ in range(2)]
    for s in (host,guest):
        prepare_fight(core,s)
        actor_at(s,650,390)
    run_until(lambda:core.step(host,TICK,lua.table()),lambda: bool(damage(host)))
    assert damage(host)==[(95000014,21)]
    host.actors[1].inv=0
    room=core.newCoop(host)
    core.attachCoop(room,host)
    core.attachCoop(room,guest)
    core.stepCoop(room,TICK)
    assert damage(host)==damage(guest)==[(95000014,21)]


def shared_duel(seed):
    lua,core=runtime()
    join_after_splash(lua,core,seed)
    players=[core.restore(lua.table_from(seed,recursive=True),12) for _ in range(4)]
    host,guest,upper,watcher=players
    for s in players:
        prepare_fight(core,s)
    actor_at(host,650)
    run_until(lambda:core.step(host,TICK,lua.table()),lambda: bool(damage(host)))
    assert damage(host)==[(95000014,17)]
    host.actors[1].inv=0
    room=core.newCoop(host)
    for s in players:
        core.attachCoop(room,s)
    step=lambda:core.stepCoop(room,TICK)
    actor_at(guest,650)
    actor_at(upper,650,390)
    actor_at(watcher,1260)
    step()
    assert [len(damage(s)) for s in players]==[1,1,0,0]
    views=[native(core.frame(s).storyDuel) for s in players]
    assert all(f==views[0] for f in views)
    assert views[0]['phase']=='out' and views[0]['x']==room.fieldSlot.enemy.x
    actor_at(host,650,390)
    actor_at(guest,650,390)
    run_until(step,lambda:room.duelRound.phase=='opening')
    cast=lua.table_from({'id':1})
    assert all(core.damageFactor(s,cast,room.fieldSlot.enemy,'hydro')==1 for s in players)

    for s,x in zip(players,(830,1127,1260,650)):
        actor_at(s,x)
    run_until(step,lambda:room.duelRound.phase=='splashWarning')
    warning=native(core.frame(host).storyDuel)
    marks=[mark['x'] for mark in warning['marks']]
    assert marks==[830,956]
    assert all(native(core.frame(s).storyDuel)==warning for s in players)
    actor_at(host,670)
    actor_at(guest,marks[1])
    actor_at(watcher,marks[0])
    run_until(step,lambda:room.duelRound.phase=='splash')
    assert damage(watcher)==[(95000014,21)] and len(damage(guest))==1
    run_until(step,lambda:len(damage(guest))==2)
    assert damage(guest)[-1]==(95000014,21)
    following=native(core.frame(guest).storyDuel)
    assert [mark['x'] for mark in following['marks']]==marks
    assert [mark['state'] for mark in following['marks']]==['spent','active']
    run_until(step,lambda:room.duelRound.phase=='splashOpening')

    previous=[balances(s) for s in players]
    for s in players:
        actor_at(s,room.fieldSlot.enemy.x)
    hit(lua,core,guest,room.fieldSlot.enemy,power=6)
    hit(lua,core,host,room.fieldSlot.enemy,power=800)
    assert [s.story.quests[QUEST].count for s in players]==[3,3,2,2]
    assert [tuple(a-b for a,b in zip(balances(s),old)) for s,old in zip(players,previous)]==[
        (CLEAR,0,0,0)]*2+[(0,0,0,0)]*2
    for s in (host,guest):
        core.detachCoop(s.coopMember,True)
        assert core.frame(s).storyFirstClear.xp==CLEAR
        place_and_act(core,s,1408,'story_collect')
        enter(core,s,1560,ROSTRUM)
        place_and_act(core,s,853,'story_collect',390)
        enter(core,s,1421,HUB)
        before=balances(s)
        for _ in range(2):
            core.action(s,'story_report:'+QUEST)
        assert tuple(a-b for a,b in zip(balances(s),before))==(REPORT,0,10800,6)
        saved=validate_save(native(core.checkpoint(s)))
        s=core.restore(lua.table_from(saved,recursive=True),12)
        assert s.story.quests[QUEST].status=='complete' and s.endgame.bosses[BOSS].clears==1
    return dict(players=4,hp=124,sharedCharge=True,safeUpperShelf=True,noRepeatedChargeOnJoin=True,
                lockedSplashMarks=marks,splitSplashDamage=True,noRepeatedSplashOnJoin=True,sharedOpening=True,
                creditedPlayers=2,chapterFirstClearExp=CLEAR,reportReward=[REPORT,10800,6])


def frame_action(client,x,action,y=480):
    with LOCK:
        actor_at(SESSIONS[client.sid]['state'],x,y)
    return client.frame([action])


def gate(client,x,node,y=480):
    f=frame_action(client,x,'story_portal:'+node,y)
    assert f['story']['node']==node
    return f


def shared_body(client):
    return next(e for e in client.frame()['coop']['enemies'] if e['id']==95000014)


def fight_hit(client,power):
    with LOCK:
        env=SESSIONS[client.sid]
        s=env['state']
        enemy=s.coop.fieldSlot.enemy
        actor_at(s,enemy.x-30)
        hit(env['lua'],env['core'],s,enemy,power=power)


def practice_check(url,seed):
    host,guest,chapter_only=clients=[Client(url) for _ in range(3)]
    for c in clients:
        c.frame(restore=seed)
    code=host.frame(['coop_create'])['coop']['code']
    for c in clients[1:]:
        assert c.frame(['coop_join:'+code])['coop']['code']==code
    for c in clients:
        c.frame(['story_accept:'+QUEST])
        gate(c,1314,MEET)
        locked=frame_action(c,1240,'story_portal:'+REVIEW)
        assert locked['story']['node']==MEET and not locked['storyNearbyPortal']['available']
        frame_action(c,418,'story_collect')
        gate(c,1240,REVIEW)
        locked=frame_action(c,1412,'story_portal:'+ARENA,390)
        assert locked['story']['node']==REVIEW and not locked['storyNearbyPortal']['available']
        frame_action(c,801,'story_collect',390)
        assert gate(c,1412,ARENA,390)['coop']['shared']
        with LOCK:
            SESSIONS[c.sid]['state'].actors[2].hp=0
    fight_hit(host,16)
    hp=shared_body(host)['hp']
    assert 0<hp<124 and shared_body(guest)['hp']==hp
    for c in clients:
        gate(c,55,REVIEW)
    with LOCK:
        world=SESSIONS[host.sid]['coop_room'].worlds[ARENA]
        paused=world.tick
    advance(host,guest,.15)
    assert world.tick==paused
    for c in clients:
        gate(c,1412,ARENA,390)
        assert shared_body(c)['hp']==hp
    fight_hit(guest,10)
    fight_hit(host,500)
    for c in (host,guest):
        frame_action(c,1408,'story_collect')
        gate(c,1560,ROSTRUM)
        frame_action(c,853,'story_collect',390)
        gate(c,1421,HUB)
        c.frame(['story_report:'+QUEST])
        gate(c,965,ARENA)
    assert chapter_only.frame()['story']['quests'][QUEST]['count']==2
    saved=[validate_save(c.frame(checkpoint=True)['checkpoint']) for c in (host,guest)]
    for i in range(2):
        if i:
            guest.frame(['coop_leave'])
        assert frame_action(host,322,'story_collect')['storyDuel']['replay']
        assert frame_action(guest,322,'story_collect')['storyDuel']['replay']
        if i:
            joined=guest.frame(['coop_join:'+code])
            assert joined['coop']['shared'] and joined['storyDuel']['replay']
        assert shared_body(host)['hp']==shared_body(guest)['hp']==124
        fight_hit(host,500)
        for c,old in zip((host,guest),saved):
            c.frame()
            result=c.frame(checkpoint=True)
            now=validate_save(result['checkpoint'])
            assert not result.get('storyDuel')
            assert now['endgame']['bosses'][BOSS]==old['endgame']['bosses'][BOSS]
            assert (now['progression']['questXp'],now['progression']['killXp'],now['mora'])==(
                old['progression']['questXp'],old['progression']['killXp'],old['mora'])
        assert chapter_only.frame()['story']['quests'][QUEST]['count']==2
        assert shared_body(chapter_only)['hp']==0
    with LOCK:
        env=SESSIONS[chapter_only.sid]
        remaining=round((world.fieldSlot.waitUntil-world.time)/TICK)
        tick_room=env['lua'].eval('function(C,room,dt,n) for _=1,n do C.stepCoop(room,dt) end end')
        tick_room(env['core'],world,TICK,remaining-2)
        assert world.fieldSlot.enemy.hp==0
        tick_room(env['core'],world,TICK,3)
        assert world.fieldSlot.enemy.hp==124
        assert env['core'].frame(env['state']).storyDuel.phase=='warning'
    return dict(players=3,individualEntryChecks=True,retreatRetainsSharedHP=True,
                practiceLobbiesSeparateFromChapter=True,practiceWins=2,joinWhilePracticing=True,
                chapterRespawnsAtFreshWarning=True,practiceAwardsNothing=True)


if __name__=='__main__':
    subprocess.run([sys.executable,'-X','utf8',str(ROOT/'test_natlan_sunset_duel.py')],check=True)
    seed=json.loads((ROOT/'work/natlan-sunset-duel-fixture.json').read_text(encoding='utf8'))
    result=dict(lua=shared_duel(seed))
    with lab() as url:
        result['http']=practice_check(url,seed)
    (ROOT/'evidence/coop-sunset-duel-lua-http.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
    print(result)
