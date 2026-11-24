"""Test the short Fallen Vigil monitors, star contacts, and earned commission."""

import json
from math import isclose

from runtime import ROOT, runtime
from test_coop_anemo import place, wait_cast
from test_coop_oceanid_maguu import share
from test_coop_sumeru_field import attack, hurt
from test_earned_branch_quests import Journey, core as prior_core, lua as prior_lua
from test_earned_snezhnaya_bosses import Encounter, Trial


SPEC=Encounter('boss-24111101','windrest-vigil-court','fallen-vigil-commission','dornman-camp')
CASE=(SPEC.id,SPEC.hub,SPEC.arena,SPEC.quest)
SOURCE=ROOT/'work/mondstadt-fresh-route/lv18-save.json'
SAVE=ROOT/'work/earned-fallen-vigil-ready.json'
SIGNATURE='FV03'


def packet(lua,state,x,**changes):
    return lua.table_from(dict(id=1,atk=1,x=x,y=480,dir=1,radial=True,range=2,
        limit=1,mult=1,critRate=0,color='#ffd685',gain=0,element='physical',startedAt=state.t)|changes)


def next_tick(state,cast):
    cast.next,cast.remaining,cast.interval=state.t+1/60,1,.1
    state.pending[len(state.pending)+1]=cast


def signature(room,states,step,side):
    slot,boss=room.fieldSlot,room.fieldSlot.enemy
    for state in states:
        place(state,boss.x+side*88)
    wait_cast(step,slot,SIGNATURE,1)
    for state in states:
        place(state,boss.x+side*88)
    wait_cast(step,slot,SIGNATURE,60)
    cast=slot.cast
    assert cast.dir==side
    return cast


def monitoring_and_emissions(lua,core):
    room,states,step=share(core,CASE)
    host,guest=states[:2]
    slot,boss=room.fieldSlot,room.fieldSlot.enemy
    assert boss.hp==boss.maxhp==700
    wait_cast(step,slot,'FV02',111)
    descent=slot.cast
    place(host,descent.center)
    place(guest,descent.center+150)
    spear_seq=host.seq
    step()
    assert boss.form=='attack' and boss.y==448 and boss.x==descent.origin
    assert hurt(host,spear_seq,boss)==[(18,'physical')]
    place(host,descent.center+150)
    wait_cast(step,slot,'FV02',141)
    assert boss.y==448 and boss.x==descent.origin
    step()
    assert descent.tick==142 and boss.form=='airborne'
    wait_cast(step,slot,'FV02',160)
    assert isclose(boss.y,480-16-.90*88) and boss.hitBottom==boss.y
    wait_cast(step,slot,'FV02',177)
    place(guest,descent.center)
    landing_seq=guest.seq
    step()
    assert boss.y==boss.hitBottom==480 and isclose(boss.x,descent.center)
    assert hurt(guest,landing_seq,boss)==[(18,'physical')]
    wait_cast(step,slot,'FV02',218)
    assert boss.y==480 and boss.form=='recover'

    cast=signature(room,states,step,1)
    normal=attack(lua,core,host,boss,atk=10)
    assert normal>0 and cast.records[1]=='none'
    for changes in (dict(reaction=True),dict(persistentTarget=boss),dict(startedAt=host.t-1)):
        core.resolveCast(host,packet(lua,host,boss.x,element='hydro',**changes))
    assert cast.records[1]=='none'
    first=packet(lua,host,boss.x,element='pyro')
    core.resolveCast(host,first)
    core.resolveCast(guest,packet(lua,guest,boss.x,element='cryo'))
    assert cast.records[1]=='pyro'
    wait_cast(step,slot,SIGNATURE,131)
    next_tick(host,first)
    opening=packet(lua,guest,boss.x,element='hydro',startedAt=guest.t+1/60)
    next_tick(guest,opening)
    step()
    assert cast.tick==132 and opening.impactEvent==1
    assert list(cast.records.values())==['pyro','hydro'] and first.impactEvent==2
    wait_cast(step,slot,SIGNATURE,215)
    assert not cast.starDevices
    step()
    devices=list(cast.starDevices.values())
    assert len(room.enemies)==1 and all(device.layers==2 for device in devices)
    assert [device.element for device in devices]==['pyro','hydro']
    assert [device.x for device in devices]==[cast.origin+offset*88 for offset in (.8,2.2)]
    assert isclose(devices[0].hitTop,480-.80*88)
    for state,x in zip(states,(devices[0].x,devices[1].x,cast.origin-80,devices[1].right+45)):
        place(state,x)
    seq=[state.seq for state in states]
    wait_cast(step,slot,SIGNATURE,288)
    assert [hurt(state,start,boss) for state,start in zip(states,seq)]==[[(26,'pyro')],[],[],[]]
    wait_cast(step,slot,SIGNATURE,360)
    hits=[hurt(state,start,boss) for state,start in zip(states,seq)]
    assert hits==[[(26,'pyro')],[(26,'hydro')],[],[]]
    wait_cast(step,slot,SIGNATURE,395)
    expiring=packet(lua,host,devices[1].x)
    next_tick(host,expiring)
    step()
    assert cast.tick==396 and not cast.starDevices and not cast.broken
    assert expiring.impactEvent==1 and devices[1].layers==2
    wait_cast(step,slot,SIGNATURE,408)
    assert boss.form=='recover' and boss.y==480
    wait_cast(step,slot,SIGNATURE,551)
    step()
    assert not slot.cast
    return dict(participants=4,spearHitAt112=18,airTicks=36,groundedAt178=True,landingHitAt178=18,
                openedSecondWindowAt132=True,secondWindowRejectedEarlierMultiHit=True,
                recordedElements=['pyro','hydro'],received=hits,expiredAt=396)


def interruptions(lua,core):
    room,states,step=share(core,CASE)
    host,guest=states[:2]
    slot,boss=room.fieldSlot,room.fieldSlot.enemy
    cast=signature(room,states,step,-1)
    wait_cast(step,slot,SIGNATURE,215)
    near=cast.origin-.80*88
    deploying=packet(lua,host,near,startedAt=host.t+1/60)
    next_tick(host,deploying)
    step()
    star,other=cast.starDevices[1],cast.starDevices[2]
    assert cast.tick==216 and star.layers==1 and other.layers==2
    assert star.element==other.element=='none'
    core.resolveCast(host,deploying)
    assert star.layers==1
    core.resolveCast(guest,packet(lua,guest,other.x,startedAt=guest.t-1))
    assert other.layers==2

    for state,x in zip(states,(star.x,other.x,cast.origin+80,other.left-55)):
        place(state,x)
    seq=[state.seq for state in states]
    wait_cast(step,slot,SIGNATURE,287)
    next_tick(guest,packet(lua,guest,star.x))
    step()
    assert star.layers==0 and cast.tick==288 and other.layers==2 and not cast.broken
    hurt_at_first=[hurt(state,start,boss) for state,start in zip(states,seq)]
    assert hurt_at_first==[[],[],[],[]]
    wait_cast(step,slot,SIGNATURE,360)
    assert hurt(guest,seq[1],boss)==[(26,'physical')] and not hurt(host,seq[0],boss)
    baseline=attack(lua,core,host,boss,atk=10)
    hp,kills,mora=boss.hp,host.kills,host.mora
    wait_cast(step,slot,SIGNATURE,395)
    core.resolveCast(host,packet(lua,host,other.x,element='geo'))
    core.resolveCast(guest,packet(lua,guest,other.x))
    step()
    assert cast.broken==396 and boss.form=='down' and not cast.starDevices and boss.hp==hp
    assert attack(lua,core,host,boss,atk=10)==baseline
    assert host.kills==kills and host.mora==mora
    wait_cast(step,slot,SIGNATURE,575)
    assert boss.form=='down'
    step()
    assert cast.tick==576 and boss.form=='standing'
    wait_cast(step,slot,SIGNATURE,599)
    step()
    assert not slot.cast

    cast=signature(room,states,step,1)
    core.resolveCast(host,packet(lua,host,boss.x,element='cryo'))
    assert cast.records[1]=='cryo',(room.time,cast.startTime,host.actors[1].hp,boss.hp)
    wait_cast(step,slot,SIGNATURE,132)
    core.resolveCast(host,packet(lua,host,boss.x,element='cryo'))
    assert list(cast.records.values())==['cryo','cryo'],(host.actors[1].hp,host.story.node,room.time,cast.startTime)
    wait_cast(step,slot,SIGNATURE,216)
    first,second=cast.starDevices[1],cast.starDevices[2]
    spread=packet(lua,host,(first.x+second.x)/2,range=75,element='cryo')
    core.resolveCast(host,spread)
    core.resolveCast(host,spread)
    assert first.layers==second.layers==1
    boss.hp=1
    core.resolveCast(host,packet(lua,host,boss.x,range=260,targetId=boss.id))
    assert slot.phase=='respawn' and not cast.starDevices and first.layers==second.layers==1
    return dict(validFirstContactAt216=True,stoppedFirstOnTick288=True,secondStillHitAt360=True,
                lateBreakAt395=True,downTicks=180,standTicks=24,noBacklashOrModifier=True,
                repeatedElementRecorded=True,wideMatchingCastOncePerStar=True,bossDefeatPrioritized=True)


def earned(short):
    route=Journey(SOURCE,engine=(prior_lua,prior_core))
    route.travel(SPEC.hub)
    assert route.state.progression.level==18 and route.actor.atk==4
    SAVE.write_text(json.dumps(route.snapshot(),ensure_ascii=False,sort_keys=True)+'\n',encoding='utf-8')
    prior=Trial(SPEC,False,file=SAVE,engine=(prior_lua,prior_core)).finish(normal=True,ticks=8000)
    alternate=Trial(SPEC,False,file=SAVE,engine=short).finish(normal=True,ticks=8000)
    for name in ('commission','killXpAndMora','maxHp','partyAttack'):
        assert prior[name]==alternate[name]
    return dict(level=18,entryPath=[leg['id'] for leg in route.itineraries[0]['stops']],
                previous=prior,short=alternate)


def main():
    short=runtime(draft_field_moves=True)
    results=monitoring_and_emissions(*short)|interruptions(*short)|earned(short)
    (ROOT/'evidence/draft-fallen-vigil-moves-lua.json').write_text(
        json.dumps(results,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print('Lua: Fallen Vigil ground landing, monitor boundaries, independent star attacks and earned commission verified.')


if __name__=='__main__':
    main()
