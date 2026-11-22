"""Verify both paired-ray encounters through shared Lua and HTTP rooms."""
import json

from runtime import ROOT, native, runtime
from savegame import validate_save
from test_coop_anemo import TICK
from test_coop_aquatic_crabs import pulse, swimmers, through
from test_coop_branch_legends import (
    SPECS, actor_at, damage, level, read, run_until, verify_credit, view,
)
from test_coop_childe import run
from test_coop_dry_legends import at, edge
from test_coop_local import Client, LOCK, SESSIONS, advance, lab


TWINS='legend-fontaine_fairy_knight_twins'
GORGE='legend-fontaine_swords_of_the_gorge'
ENTRANCES={TWINS:'fon-wp-50075',GORGE:'fon-wp-50071'}


def fixture(lua,core):
    s=core.restore(lua.table_from(read('work/fontaine-ray-pairs-fixture.json'),recursive=True))
    s.mora=400000
    assert core.giveArtifact(s,1,82,3)
    core.action(s,'artifact_equip:1')
    core.action(s,'artifact_upgrade:1')
    assert core.giveArtifact(s,2,40,3)
    core.action(s,'artifact_equip:2')
    saved=validate_save(native(core.checkpoint(s)))
    (ROOT/'work/coop-fontaine-ray-pairs-fixture.json').write_text(json.dumps(saved),encoding='utf8')


def shared_combat(core,id):
    spec,parties=swimmers(core,id)
    a,b,middle,watcher=parties
    room=core.newCoop(a)
    for party in parties: core.attachCoop(room,party)
    slot=room.fieldSlot
    main,partner=slot.enemy,slot.enemy.fieldPartner
    step=lambda:core.stepCoop(room,TICK)
    run_until(step,lambda:slot.cast and slot.cast.tick==49)
    cast=slot.cast
    assert cast.move.id==('FW31' if id==TWINS else 'FW34')
    shallow,deep=cast.strikes[1],cast.strikes[2]
    warnings=view(core,a)['warnings']
    assert [w['sourceId'] for w in warnings]==[main.id,partner.id]
    assert [w['first'] for w in warnings]==([58,104] if id==TWINS else [58,58])
    assert all(view(core,s)['warnings']==warnings for s in parties)
    depths=[(w['top'],w['bottom']) for w in warnings]
    safe_y=(shallow.bottom+50+deep.top)/2
    assert shallow.bottom+50<safe_y<deep.top
    actor_at(a,shallow.origin,shallow.y+25)
    actor_at(b,deep.origin,deep.y+25)
    actor_at(middle,min(shallow.origin,deep.origin)-190,safe_y)
    actor_at(watcher,1450,safe_y)
    run(step,shallow.first-cast.tick)
    current=view(core,a)['warnings']
    assert [w['active'] for w in current]==[True,id==GORGE]
    assert all(view(core,s)['warnings']==current for s in parties)
    assert damage(a)==[(main.id,shallow.damage)] and not damage(middle)
    assert damage(b)==([(partner.id,deep.damage)] if id==GORGE else [])
    run(step,deep.after-cast.tick)
    assert damage(a)==[(main.id,shallow.damage)]
    assert damage(b)==[(partner.id,deep.damage)]
    assert not damage(middle) and not damage(watcher)

    upper=pulse(core,a,main)
    lower=pulse(core,b,partner)
    assert upper>0 and lower==upper
    assert main.hp==partner.hp==spec['hp']-upper-lower
    original=partner.x,partner.y,partner.hitTop,partner.hitBottom
    partner.x,partner.y,partner.hitTop,partner.hitBottom=main.x,main.y,main.hitTop,main.hitBottom
    overlap=pulse(core,a,main)
    assert overlap==upper and main.hp==partner.hp==spec['hp']-upper-lower-overlap
    partner.x,partner.y,partner.hitTop,partner.hitBottom=original
    assert all(view(core,s)['hp']==main.hp for s in parties)

    # Finish on the lower ray while the finisher is outside the primary body's payout range.
    finisher=actor_at(b,partner.x+205,partner.y+28)
    assert abs(finisher.x-main.x)>420
    finisher.dir,finisher.cd.swimPulse,finisher.atk=-1,0,10000
    actor_at(middle,main.x,main.y+28)
    actor_at(watcher,partner.x,partner.y+28)
    core.action(b,'normal')
    assert slot.phase=='cleared' and main.hp==partner.hp==0
    assert all(view(core,s)['phase']=='cleared' for s in parties)
    return dict(move=cast.move.id,sources=[main.id,partner.id],depths=depths,
                upperPulse=upper,lowerPulse=lower,overlapPulse=overlap,
                xp=verify_credit(core,parties,id,spec['mora']))


def hp(frame):
    return [e['hp'] for e in frame['coop']['enemies']]


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
    assert hp(through(host,entrance,arena))==[spec['hp']]*2
    gate=edge(entrance,arena)
    at(guest,gate['x'],gate['y'])
    blocked=guest.frame(['story_portal:'+arena])
    assert blocked['story']['node']==entrance and '100' in blocked['storyNearbyPortal']['reason']
    assert blocked['coop']['code']==code
    with LOCK:
        env=SESSIONS[guest.sid]
        level(env['core'],env['state'],100)
    through(guest,entrance,arena)
    with LOCK:
        env=SESSIONS[host.sid]
        core=env['core']
        states=[SESSIONS[c.sid]['state'] for c in clients]
        room=env['coop_room'].worlds[arena]
        main=room.fieldSlot.enemy
        pair=(main,main.fieldPartner)
        for s,body in zip(states,pair,strict=True):
            actor_at(s,body.x-160,body.y+28).dir=1
    for client in clients: client.frame(['normal'])
    a,b=advance(host,guest,.1)
    remaining=hp(a)[0]
    assert 0<remaining<spec['hp'] and hp(a)==hp(b)==[remaining]*2
    for client in clients: through(client,arena,entrance)
    paused=room.tick
    advance(host,guest,.16)
    assert room.tick==paused
    for client in clients:
        assert hp(through(client,entrance,arena))==[remaining]*2
    with LOCK:
        pulse(core,states[0],main)
        pulse(core,states[1],main.fieldPartner,10000)
    for client in clients:
        f=client.frame(checkpoint=True)
        assert hp(f)==[0,0] and f['kills']==1
        saved=validate_save(f['checkpoint'])
        assert saved['endgame']['bosses'][id]['clears']==1
    through(host,arena,entrance)
    assert hp(through(host,entrance,arena))==[0,0]
    for client in clients: through(client,arena,entrance)
    assert hp(through(host,entrance,arena))==[spec['hp']]*2


if __name__=='__main__':
    lua,core=runtime()
    fixture(lua,core)
    outcomes={id:shared_combat(core,id) for id in ENTRANCES}
    with lab() as url:
        for id in ENTRANCES: http(url,id)
    proof=dict(lua=dict(participants=4,outcomes=outcomes,personalDepthAndInjury=True,
                        safeMiddleBetweenBlades=True,partnerOnlyFinisherCredited=True,
                        onlyContributorsCredited=True,onePulsePerSharedReceiver=True),
               http=dict(participants=2,individualLevelGate=True,sharedHpFromBothBodies=True,
                         retreatPreservesBoth=True,eachRewardSavedOnce=True,rematchWaitsForAll=True))
    (ROOT/'evidence/coop-ray-pairs-lua-http.json').write_text(json.dumps(proof,indent=2)+'\n',encoding='utf8')
    print(proof)
