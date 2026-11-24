"""Exercise the short Moongecko fight with earned gear and a four-member room."""

import json
from math import isclose

from runtime import ROOT, runtime
from test_coop_anemo import place, wait_cast
from test_coop_oceanid_maguu import share
from test_coop_sumeru_field import attack, hurt
from test_draft_nod_boss_balance import SAVES, SPECS
from test_earned_branch_quests import Journey, core as prior_core, lua as prior_lua
from test_earned_snezhnaya_bosses import Trial


SPEC = SPECS['moongecko']
CASE = (SPEC.id, SPEC.hub, 'nod-field', SPEC.quest)
SAVE = SAVES/'earned-lv133.json'
SIGNATURE = 'FMG03'


def at_tick(trial, tick):
    cast = trial.slot.cast
    return cast and cast.move.id == SIGNATURE and cast.tick == tick


def contact(lua, state, rock, **changes):
    return lua.table_from(dict(id=1,atk=100,x=rock.x,y=480,dir=1,radial=True,range=1,
        vertical=1,limit=1,mult=1,critRate=0,color='#ffc440',gain=0,element='physical',
        startedAt=state.t)|changes)


def lock_sweep(room, states, step, side=1):
    slot, boss = room.fieldSlot, room.fieldSlot.enemy
    for state in states:
        place(state,boss.x+side*88)
    wait_cast(step,slot,SIGNATURE,1)
    for state in states:
        place(state,boss.x+side*88)
    wait_cast(step,slot,SIGNATURE,60)
    cast = slot.cast
    assert cast.dir == side
    return cast


def natural_release(lua, core):
    room, states, step = share(core,CASE)
    slot,boss = room.fieldSlot,room.fieldSlot.enemy
    assert boss.maxhp == 4500000
    for state in states:
        place(state,boss.x+88)
    wait_cast(step,slot,'FMG02',90)
    leap = slot.cast
    assert boss.form == 'airborne' and boss.y == 480
    wait_cast(step,slot,'FMG02',108)
    assert boss.y == 392 and boss.hitBottom == 392
    wait_cast(step,slot,'FMG02',125)
    assert boss.y < 480 and boss.hitBottom == boss.y
    step()
    assert leap.tick == 126 and (boss.x,boss.y,boss.hitBottom)==(leap.center,480,480)

    cast = lock_sweep(room,states,step)
    assert isclose(cast.left,cast.origin+.10*88) and isclose(cast.right,cast.origin+2.70*88)
    wait_cast(step,slot,SIGNATURE,83)
    assert not cast.rock
    old = room.time
    step()
    rock = cast.rock
    assert cast.tick == 84 and rock.layers == 5 and len(room.enemies) == 1
    assert isclose(rock.x,cast.origin+1.20*88) and isclose(rock.hitTop,480-.90*88)
    assert isclose(rock.x-rock.hitHalfWidth,cast.origin+.85*88)
    assert isclose(rock.x+rock.hitHalfWidth,cast.origin+1.55*88)
    a = states[0]
    stale = contact(lua,a,rock,startedAt=a.t-(room.time-old))
    reaction = contact(lua,a,rock,reaction=True)
    dot = contact(lua,a,rock,persistentTarget=boss)
    airborne = contact(lua,a,rock,y=rock.hitTop-8)
    for packet in (stale,reaction,dot,airborne):
        core.resolveCast(a,packet)
    assert rock.layers == 5
    core.resolveCast(a,contact(lua,a,rock))
    assert rock.layers == 4
    wait_cast(step,slot,SIGNATURE,299)
    core.resolveCast(a,contact(lua,a,rock,element='geo'))
    assert rock.layers == 2
    at_deadline=contact(lua,a,rock,element='geo',next=a.t+1/60,remaining=1,interval=.1)
    a.pending[len(a.pending)+1]=at_deadline
    step()
    assert cast.tick == 300 and cast.rock is None and cast.broken is None
    assert at_deadline.impactEvent==1 and rock.layers==2
    core.resolveCast(a,contact(lua,a,rock,element='geo'))
    assert rock.layers == 2

    # Only the first member is inside the locked ground lane.
    for state,x in zip(states,((cast.left+cast.right)/2,cast.right+55,cast.left-60,cast.right+80)):
        place(state,x)
    seq = [state.seq for state in states]
    wait_cast(step,slot,SIGNATURE,323)
    assert not any(hurt(state,start,boss) for state,start in zip(states,seq))
    step()
    received=[hurt(state,start,boss) for state,start in zip(states,seq)]
    assert received == [[(34,'geo')],[],[],[]]
    wait_cast(step,slot,SIGNATURE,360)
    assert boss.form == 'recover'
    assert not any(core.radiantCocoonEffect(state,1) for state in states)
    wait_cast(step,slot,SIGNATURE,503)
    step()
    assert slot.cast is None
    return dict(participants=4,airTicks=36,apexY=392,acceptedAt=[84,299],closedAt=300,
        rejectedPriorAndIndirectCasts=True,sweepDamageByParticipant=received,naturalRecoveryTicks=144)


def interruption(lua, core):
    room, states, step = share(core,CASE)
    host,guest = states[:2]
    slot,boss = room.fieldSlot,room.fieldSlot.enemy
    cast = lock_sweep(room,states,step,-1)
    wait_cast(step,slot,SIGNATURE,84)
    rock = cast.rock
    assert isclose(rock.x,cast.origin-1.20*88)
    baseline = attack(lua,core,host,boss,element='geo',atk=100)
    hp, kills, mora = boss.hp,host.kills,host.mora
    first=contact(lua,host,rock,element='geo')
    core.resolveCast(host,first)
    core.resolveCast(host,first)
    assert rock.layers==3 and boss.hp==hp
    core.resolveCast(guest,contact(lua,guest,rock,element='geo'))
    assert rock.layers==1 and boss.hp==hp
    wait_cast(step,slot,SIGNATURE,299)
    core.resolveCast(host,contact(lua,host,rock))
    assert rock.layers==0 and boss.hp==hp
    step()
    assert cast.broken==300 and boss.form=='down' and cast.rock is None
    assert len(room.enemies)==1 and boss.hp==hp and host.kills==kills and host.mora==mora
    assert attack(lua,core,host,boss,element='geo',atk=100)==baseline
    wait_cast(step,slot,SIGNATURE,479)
    assert boss.form=='down'
    step()
    assert cast.tick==480 and boss.form=='standing'
    wait_cast(step,slot,SIGNATURE,503)
    step()
    assert slot.cast is None

    cast=lock_sweep(room,states,step)
    wait_cast(step,slot,SIGNATURE,84)
    rock=cast.rock
    boss.hp=1
    core.resolveCast(host,contact(lua,host,rock,range=240,targetId=boss.id))
    assert slot.phase=='respawn' and cast.rock is None and rock.layers==5
    return dict(layersAfterCasts=[3,1,0],sameCastCountedOnce=True,noBacklashOrModifier=True,
                normalGeoDamage=baseline,downTicks=180,standTicks=24,bossDefeatPrioritized=True)


def earned(short):
    browser=Journey(SAVE,engine=(prior_lua,prior_core))
    browser.warp(SPEC.hub)
    (ROOT/'work/earned-moongecko-ready.json').write_text(
        json.dumps(browser.snapshot(),ensure_ascii=False)+'\n',encoding='utf-8')
    prior=Trial(SPEC,False,file=SAVE,engine=(prior_lua,prior_core)).finish(normal=True,ticks=16000)
    alternate=Trial(SPEC,False,file=SAVE,engine=short).finish(normal=True,ticks=16000)
    fighter=Trial(SPEC,False,file=SAVE,engine=short)
    fighter.until(lambda: at_tick(fighter,84))
    rock=fighter.slot.cast.rock
    fighter.until(lambda: fighter.boss.form=='down',normal=True,aim=rock,ticks=216)
    break_tick=fighter.slot.cast.broken
    interrupted=fighter.finish(normal=True,ticks=16000)
    escape=Trial(SPEC,False,file=SAVE,engine=short)
    escape.trip.state.actors[2].hp=0
    escape.until(lambda: at_tick(escape,60))
    wave=escape.slot.cast
    dest=wave.right+40 if wave.dir>0 else wave.left-40
    escape.trip.approach(dest,480,'掃蕩の予告範囲外')
    assert wave.tick<324
    assert escape.trip.actor.x>wave.right+10 if wave.dir>0 else escape.trip.actor.x<wave.left-10
    hp=escape.trip.actor.hp
    escape.trip.tick(360-wave.tick)
    assert escape.boss.form=='recover' and escape.trip.actor.hp==hp and not wave.broken
    seq=escape.trip.state.seq
    escape.until(lambda: any(e.seq>seq and e.kind=='hit' and e.actor==1 and e.target==escape.boss.id
                               for e in escape.trip.state.events.values()),normal=True,ticks=144)
    assert wave.tick<504
    for result in (alternate,interrupted):
        for key in ('commission','killXpAndMora','maxHp','partyAttack'):
            assert result[key]==prior[key]
    return dict(level=133,previous=prior,short=alternate,interrupted=interrupted,
                interruptedAtTick=break_tick,walkedOffSweep=True,counterTick=wave.tick)


def main():
    short=runtime(draft_field_moves=True)
    result=natural_release(*short)|interruption(*short)|earned(short)
    (ROOT/'evidence/draft-moongecko-moves-lua.json').write_text(
        json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print('Lua: Moongecko leap, rock deadline, local sweep, both counter options and earned quest verified.')


if __name__=='__main__':
    main()
