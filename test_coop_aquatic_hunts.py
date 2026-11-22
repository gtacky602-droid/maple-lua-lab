"""Check shared sonar exposure and Luachra's sweeping dash."""
import json
from time import monotonic, sleep

from runtime import ROOT, runtime
from savegame import validate_save
from test_coop_anemo import TICK
from test_coop_aquatic_crabs import equipped_fixture, pulse, swimmers, through
from test_coop_branch_legends import (
    SPECS, actor_at, damage, level, run_until, verify_credit, view,
)
from test_coop_childe import run
from test_coop_dry_legends import at, edge
from test_coop_local import Client, LOCK, SESSIONS, advance, lab


VETERAN='legend-fontaine_fading_veteran'
DOBHARCU='legend-fontaine_dobharcu_lord_of_the_hidden'
LUACHRA='legend-fontaine_luachra_the_brilliant'
ENTRANCES={VETERAN:'fon-wp-50073',DOBHARCU:'fon-wp-50062',LUACHRA:'fon-wp-53865'}
ECHO_ART='fontaine-echo-poses-source-v1.png'


def shared_room(core,id,tick):
    spec,parties=swimmers(core,id)
    room=core.newCoop(parties[0])
    for party in parties: core.attachCoop(room,party)
    slot=room.fieldSlot
    step=lambda:core.stepCoop(room,TICK)
    run_until(step,lambda:slot.cast and slot.cast.tick==tick)
    return spec,parties,slot,step


def sonar_view(core,s):
    return core.frame(s,'sprite').storySwimCombat.sonar


def sonar(core,id):
    move=SPECS[id]['moves'][0]
    spec,parties,slot,step=shared_room(core,id,move['steps'][0]['first']+3)
    host,guest,wrong_way,observer=parties
    cast,boss=slot.cast,slot.enemy
    assert cast.move.id==move['id'] and boss.underground
    first=view(core,host)['warnings'][0]
    assert first['active'] and first['orb']['x']!=cast.strikes[1].origin
    for s in parties:
        f=core.frame(s,'sprite')
        assert f.storySwimCombat.sonar.hidden
        assert not any(d.source==ECHO_ART for d in f.draws.values())
    assert pulse(core,guest,boss)==0
    actor_at(wrong_way,boss.x-160,boss.y+28).dir=-1
    core.action(wrong_way,'skill1')
    assert sonar_view(core,wrong_way).cooldown>0 and sonar_view(core,host).cooldown==0
    actor_at(wrong_way,boss.x-160,boss.y+28).dir=1
    core.action(wrong_way,'skill1')
    assert boss.underground and not cast.revealedUntil
    actor_at(host,boss.x-160,boss.y+28).dir=1
    before=cast.tick
    core.action(host,'skill1')
    duration=spec['swimPlayer']['sonar']['exposureTicks']
    assert not boss.underground and cast.revealedUntil==before+duration
    for s in parties:
        f=core.frame(s,'sprite')
        assert f.storySwimCombat.sonar.exposed==duration/60
        assert not f.storySwimCombat.sonar.hidden and len(f.fieldBoss.warnings)==0
        assert any(d.source==ECHO_ART for d in f.draws.values())
    assert sonar_view(core,guest).cooldown==0 and sonar_view(core,host).cooldown>0
    actor_at(observer,boss.x-160,boss.y+28).dir=1
    core.action(observer,'skill1')
    assert cast.revealedUntil==before+duration and boss.hp==spec['hp']
    strike_damage=pulse(core,guest,boss)
    assert strike_damage>0 and all(view(core,s)['hp']==boss.hp for s in parties)
    seen=[damage(s) for s in parties]
    run(step,duration-1)
    assert slot.cast and not boss.underground and sonar_view(core,guest).exposed>0
    assert [damage(s) for s in parties]==seen
    step()
    assert slot.cast is None and all(sonar_view(core,s).exposed==0 for s in parties)
    assert pulse(core,host,boss,10000)>0 and slot.phase=='cleared'
    xp=verify_credit(core,parties,id,spec['mora'])
    return dict(move=move['id'],exposedTicks=duration,guestPulse=strike_damage,xp=xp)


def dash(core):
    spec,parties,slot,step=shared_room(core,LUACHRA,61)
    host,guest,above,observer=parties
    cast,boss=slot.cast,slot.enemy
    strike=cast.strikes[1]
    assert cast.move.id=='FW47' and strike.dash
    actor_at(host,strike.origin,strike.y+25)
    actor_at(guest,strike.destination,strike.y+25)
    actor_at(above,strike.origin,strike.top-14)
    actor_at(observer,1400,390)
    step()
    first=view(core,host)['warnings'][0]
    assert first['active'] and first['activeLeft']<=boss.x<=first['activeRight']
    assert boss.x==strike.x!=strike.origin
    assert all(view(core,s)['warnings']==[first] for s in parties)
    assert [damage(s) for s in parties]==[[(97069,35)],[],[],[]]
    run(step,strike.after-cast.tick-1)
    last=view(core,host)['warnings'][0]
    assert last['activeRight']<first['activeLeft']
    assert boss.x==strike.x==strike.destination
    assert [damage(s) for s in parties]==[[(97069,35)],[(97069,35)],[],[]]
    assert pulse(core,guest,boss,side=1)>0
    assert pulse(core,host,boss,10000,side=1)>0 and slot.phase=='cleared'
    return dict(move=cast.move.id,damage=35,xp=verify_credit(core,parties,LUACHRA,spec['mora']))


def wait_hidden(first,second):
    until=monotonic()+6
    while monotonic()<until:
        a,b=advance(first,second,.085)
        if all(f['storySwimCombat']['sonar']['hidden'] for f in (a,b)):
            return
        sleep(.03)
    raise AssertionError('Shared concealment did not start')


def http(url,id):
    spec=SPECS[id]
    entrance,arena=ENTRANCES[id],spec['node']
    host,guest=clients=(Client(url),Client(url))
    for i,client in enumerate(clients):
        client.frame(['story_start'])
        with LOCK:
            env=SESSIONS[client.sid]
            level(env['core'],env['state'],100-i)
            env['core'].enterStoryNode(env['state'],entrance)
            env['state'].actors[2].hp=0
    code=host.frame(['coop_create'])['coop']['code']
    assert guest.frame(['coop_join:'+code])['coop']['code']==code
    assert through(host,entrance,arena)['coop']['enemies'][0]['hp']==spec['hp']
    gate=edge(entrance,arena)
    at(guest,gate['x'],gate['y'])
    blocked=guest.frame(['story_portal:'+arena])
    assert blocked['story']['node']==entrance and '100' in blocked['storyNearbyPortal']['reason']
    with LOCK:
        env=SESSIONS[guest.sid]
        level(env['core'],env['state'],100)
    through(guest,entrance,arena)
    with LOCK:
        env=SESSIONS[host.sid]
        core=env['core']
        states=[SESSIONS[c.sid]['state'] for c in clients]
        room=env['coop_room'].worlds[arena]
        boss=room.fieldSlot.enemy
        for s in states: actor_at(s,boss.x-160,boss.y+28).dir=1
    if id!=LUACHRA:
        wait_hidden(host,guest)
        first=host.frame(['skill1'])['storySwimCombat']['sonar']
        second=guest.frame()['storySwimCombat']['sonar']
        assert first['exposed']>0 and second['exposed']>0 and first['cooldown']>0 and second['cooldown']==0
    for client in clients: client.frame(['normal'])
    a,b=advance(host,guest,.12)
    remaining=a['coop']['enemies'][0]['hp']
    assert 0<remaining<spec['hp'] and b['coop']['enemies'][0]['hp']==remaining
    for client in clients: through(client,arena,entrance)
    frozen=room.tick
    advance(host,guest,.16)
    assert (room.tick,boss.hp)==(frozen,remaining)
    for client in clients:
        assert through(client,entrance,arena)['coop']['enemies'][0]['hp']==remaining
    with LOCK:
        actor_at(states[0],boss.x-140,boss.y+28)
        assert pulse(core,states[1],boss,10000)>0
    for client in clients:
        f=client.frame(checkpoint=True)
        assert f['kills']==1 and f['coop']['enemies'][0]['hp']==0
        assert validate_save(f['checkpoint'])['endgame']['bosses'][id]['clears']==1
        through(client,arena,entrance)
    assert through(host,entrance,arena)['coop']['enemies'][0]['hp']==spec['hp']


if __name__=='__main__':
    lua,core=runtime()
    for name in ('fontaine-echo','fontaine-bubble'): equipped_fixture(lua,core,name)
    outcomes={id:sonar(core,id) for id in (VETERAN,DOBHARCU)}
    outcomes[LUACHRA]=dash(core)
    with lab() as url:
        for id in ENTRANCES: http(url,id)
    proof=dict(lua=dict(participants=4,outcomes=outcomes,sharedRevealCancelsActiveOrb=True,
                        wrongDirectionAndCooldownArePersonal=True,repeatEchoDoesNotExtend=True,
                        allyCanHitDuringReveal=True,dashSweepsWithBody=True,dashDepthAvoidance=True,
                        onlyContributorsCredited=True),
               http=dict(participants=2,individualLevelGate=True,sharedRevealFromRealInput=True,
                         retreatPreservesHp=True,eachRewardSavedOnce=True,sharedRematch=True))
    (ROOT/'evidence/coop-aquatic-hunts-lua-http.json').write_text(json.dumps(proof,indent=2)+'\n',encoding='utf8')
    print(proof)
