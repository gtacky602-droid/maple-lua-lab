"""Check the lake legends' shared water hazards and independent settlement."""
import json

from runtime import ROOT, runtime
from test_coop_anemo import TICK
from test_coop_branch_legends import (
    actor_at, browser_fixtures, damage, hit, match, run_until, verify_credit, via_http, view,
)
from test_coop_childe import run
from test_coop_local import lab


VIVIANNE='legend-fontaine_vivianne_of_the_lake'
NINIANNE='legend-fontaine_ninianne_of_the_lake'


def open_cast(core,id,index,before):
    spec,parties=match(core,id)
    room=core.newCoop(parties[0])
    members=[core.attachCoop(room,s) for s in parties]
    slot=room.fieldSlot
    slot.index=index
    step=lambda:core.stepCoop(room,TICK)
    run_until(step,lambda:slot.cast is not None and slot.cast.tick==before)
    assert all(view(core,s)['warnings']==view(core,parties[0])['warnings'] for s in parties)
    return spec,parties,members,slot,step


def finish(lua,core,spec,parties,slot):
    for s in parties: actor_at(s,slot.enemy.x)
    hit(lua,core,parties[0],slot.enemy)
    hit(lua,core,parties[1],slot.enemy)
    assert all(view(core,s)['hp']==spec['hp']-200 for s in parties)
    hit(lua,core,parties[0],slot.enemy,power=10000)
    assert slot.phase=='cleared'
    return verify_credit(core,parties,spec['id'],spec['mora'])


def vivianne(lua,core):
    spec,parties,members,slot,step=open_cast(core,VIVIANNE,1,51)
    host,guest,jumper,spectator=parties
    cast=slot.cast
    assert cast.move.id=='LV01'
    wave=cast.strikes[1]
    # One player stands near the wave's origin and the other near its destination.
    actor_at(host,wave['from'])
    actor_at(guest,wave.to)
    actor_at(jumper,wave['from'])
    actor_at(spectator,spec['home']+330)
    core.action(jumper,'jump')
    members[2].input=lua.table(jump=True)
    run(step,13)
    members[2].input=None
    assert jumper.actors[1].y<spec['floorY']-wave.step.height
    assert [damage(s) for s in parties]==[[(97041,18)],[],[],[]]
    start=view(core,host)['warnings'][0]
    assert start['left']<=start['activeLeft']<start['activeRight']<=start['right']
    assert start['activeRight']-start['activeLeft']<start['right']-start['left']
    host.actors[1].inv=0
    run_until(step,lambda:cast.tick==wave.step.after-1)
    last=view(core,host)['warnings'][0]
    assert last['activeRight']<start['activeLeft']
    assert all(view(core,s)['warnings']==[last] for s in parties)
    assert [damage(s) for s in parties]==[[(97041,18)],[(97041,18)],[],[]]
    return finish(lua,core,spec,parties,slot)


def ninianne(lua,core):
    spec,parties,_,slot,step=open_cast(core,NINIANNE,3,50)
    host,guest,runner,spectator=parties
    cast=slot.cast
    column,backwash=cast.strikes[1],cast.strikes[2]
    warnings=view(core,host)['warnings']
    assert cast.move.id=='LN03'
    assert [(w['number'],w['first'],w['height']) for w in warnings]==[(1,63,136),(2,107,51)]
    actor_at(host,(column.left+column.right)/2)
    actor_at(guest,1100)
    actor_at(runner,column.right+22)
    actor_at(spectator,1250)
    run(step,column.step.first-cast.tick)
    active=view(core,host)['warnings']
    assert all(view(core,s)['warnings']==active for s in parties)
    assert (active[0]['activeLeft'],active[0]['activeRight'])==(column.left,column.right)
    assert damage(host)==[(97042,18)] and not any(damage(s) for s in parties[1:])
    actor_at(host,1100)
    actor_at(runner,1150)
    actor_at(guest,(backwash.left+backwash.right)/2)
    run(step,backwash.step.first-cast.tick)
    assert [damage(s) for s in parties]==[[(97042,18)],[(97042,20)],[],[]]
    return finish(lua,core,spec,parties,slot)


if __name__=='__main__':
    lua,core=runtime()
    vivianne_xp=vivianne(lua,core)
    ninianne_xp=ninianne(lua,core)
    browser_fixtures(lua,core,(VIVIANNE,NINIANNE))
    with lab() as url:
        for id in (VIVIANNE,NINIANNE): via_http(url,id,check_level=True)
    proof=dict(lua=dict(participants=4, waveSweepsInsideWarning=True, waveHitsAtDifferentTimes=True,
                        jumpAvoidsWave=True, columnStaysInLockedPlace=True, backwashFollowsColumn=True,
                        onlyContributorsCredited=True,vivianneXp=vivianne_xp,ninianneXp=ninianne_xp),
               http=dict(participants=2, level100RequiredIndividually=True, sharedHpFromNormalAttacks=True,
                         incompleteBattleResumes=True, sharedDefeatSaved=True, rematchWaitsForAllToLeave=True))
    (ROOT/'evidence/coop-lake-legends-lua-http.json').write_text(json.dumps(proof,indent=2)+'\n',encoding='utf8')
    print(proof)
