"""Verify phase travel, combat, and reset rules for the first two night trials."""
import json
import subprocess
import sys
from time import monotonic, sleep

from runtime import ROOT, runtime
from test_coop_branch_legends import SPECS, actor_at, hit, level
from test_coop_natlan_entry_legends import shared_attacks, start
from test_coop_late_branch_bosses import difference, report_rewards
from test_coop_local import Client, LOCK, SESSIONS, advance, lab
from test_coop_ruin_guardians import QUESTS, balances, cross, edge


HOSTS={
    'legend-natlan_undead':'nat-wp-72417',
    'legend-natlan_chimalli':'nat-wp-72416',
}


def timed_travel(client,source,target,other,*,shared=True):
    gate=edge(source,target)
    duration=gate.get('phaseSeconds',gate.get('liftSeconds'))
    with LOCK:
        state=SESSIONS[client.sid]['state']
        actor=state.actors[state.active]
        actor.x,actor.y,actor.vy,actor.ground=gate['x'],gate.get('y',480),0,True
    frame=client.frame(['story_portal:'+target])
    assert frame['story']['node']==source and frame['storyLift']['phase']==('phaseSeconds' in gate)
    assert frame['storyLift']['seconds']==duration
    if 'wallTrack' in gate:
        assert frame['storyLift']['wall']
    until=monotonic()+duration+5
    while monotonic()<until:
        sleep(.03)
        frame=client.frame(steps=0 if shared else 3)
        other.frame()
        if frame['story']['node']==target:
            assert bool(frame['coop'].get('shared'))==shared
            if shared:
                assert frame['coop']['map']==target
            assert abs(frame['actors'][0]['x']-gate['arrivalX'])<=1
            return frame
    raise AssertionError((source,target,frame.get('storyLift')))


def outgoing_reward(lua,core,spec):
    id=spec['id']
    arena=spec['node']
    approach=spec['entryThrough'][-1]
    players=[start(core,spec['level']) for _ in range(2)]
    for state in players:
        core.enterStoryNode(state,arena)
        state.actors[2].hp=0
    host,guest=players
    room=core.newCoop(host)
    for state in players:
        core.attachCoop(room,state)
    body=room.fieldSlot.enemy
    body.x=450
    actor_at(guest,body.x)
    hit(lua,core,guest,body,power=40)
    portal=edge(arena,approach)
    actor_at(guest,portal['x'])
    core.action(guest,'story_portal:'+approach)
    assert guest.lift.phase and guest.story.node==arena
    actor_at(host,body.x)
    hit(lua,core,host,body,power=10000)
    assert host.endgame.bosses[id].clears==1
    assert guest.kills==0 and (guest.endgame is None or guest.endgame.bosses[id] is None)
    return True


def knock_out(env):
    for actor in env['state'].actors.values():
        actor.hp=0


def http_trial(url,id,host_node,prepare=None,quest=None):
    spec=SPECS[id]
    arena=spec['node']
    approach=spec['entryThrough'][-1]
    entrance=edge(approach,arena)
    host,guest=Client(url),Client(url)
    for client in (host,guest):
        client.frame()
        with LOCK:
            env=SESSIONS[client.sid]
            core,s=env['core'],env['state']
            core.action(s,'story_start')
            core.enterStoryNode(s,'natlan-hub')
            level(core,s,spec['level']-int(client is guest))
            if quest:
                core.action(s,'story_accept:'+quest)
            core.enterStoryNode(s,host_node)
    code=host.frame(['coop_create'])['coop']['code']
    assert guest.frame(['coop_join:'+code])['coop']['code']==code
    if prepare:
        prepare(host,guest,host_node,approach)
    else:
        for client in (host,guest):
            assert cross(client,edge(host_node,approach))['coop']['shared']
    assert timed_travel(host,approach,arena,guest)['coop']['code']==code
    with LOCK:
        env=SESSIONS[guest.sid]
        actor_at(env['state'],entrance['x'],entrance.get('y',480))
    locked=guest.frame(['story_portal:'+arena])
    assert str(spec['level']) in locked['storyNearbyPortal']['reason']
    assert locked['story']['node']==approach and 'storyLift' not in locked
    with LOCK:
        level(env['core'],env['state'],spec['level'])
    assert timed_travel(guest,approach,arena,host)['coop']['peers'][0]['map']==arena

    with LOCK:
        env=SESSIONS[host.sid]
        core,lua,state=env['core'],env['lua'],env['state']
        other=SESSIONS[guest.sid]['state']
        room=state.coop
        slot=room.fieldSlot
        boss=slot.enemy
        generation=slot.generation
        actor_at(state,boss.x-56).dir=1
        state.actors[2].hp=0
        other.actors[2].hp=0
    host.frame(['normal'])
    a,b=advance(host,guest,.4)
    hp=a['fieldBoss']['hp']
    assert 0<hp<spec['hp'] and b['fieldBoss']['hp']==hp

    # An ordinary exit is a retreat with the same fight waiting when everyone leaves.
    timed_travel(host,arena,approach,guest)
    timed_travel(guest,arena,approach,host)
    frozen=room.tick,boss.hp
    advance(host,guest,.11)
    assert frozen==(room.tick,boss.hp)
    for client,peer in ((host,guest),(guest,host)):
        assert timed_travel(client,approach,arena,peer)['coop']['enemies'][0]['hp']==frozen[1]

    # A player losing both characters returns to their own pillar.
    with LOCK:
        knock_out(env)
    returned,remaining=advance(host,guest,.12)
    assert (returned['story']['node'],returned['actors'][0]['x'],returned['actors'][0]['y'],returned['returns'])==(
        approach,entrance['x'],entrance.get('y',480),1)
    assert remaining['story']['node']==arena and remaining['coop']['enemies'][0]['hp']==frozen[1]
    assert slot.generation==generation
    with LOCK:
        knock_out(SESSIONS[guest.sid])
    a,b=advance(host,guest,.12)
    assert b['story']['node']==approach and b['returns']==1
    assert a['story']['node']==approach and not a['kills'] and not b['kills']
    assert slot.generation==generation+1 and slot.enemy.hp==spec['hp'] and slot.cast is None, (
        id,generation,slot.generation,slot.enemy.hp,slot.phase,room.nightTrialWipe)

    for client,peer in ((host,guest),(guest,host)):
        timed_travel(client,approach,arena,peer)
    with LOCK:
        boss=slot.enemy
        for player in (state,other):
            actor_at(player,boss.x)
        hit(lua,core,other,boss,power=35)
        hit(lua,core,state,boss,power=10000)
    saves=[]
    for client in (host,guest):
        frame=client.frame(checkpoint=True)
        assert frame['fieldBoss']['phase']=='cleared' and frame['kills']==1
        assert frame['checkpoint']['endgame']['bosses'][id]['clears']==1
        saves.append(frame['checkpoint'])
    timed_travel(host,arena,approach,guest)
    assert timed_travel(host,approach,arena,guest)['coop']['enemies'][0]['hp']==0
    timed_travel(host,arena,approach,guest)
    timed_travel(guest,arena,approach,host)
    assert timed_travel(host,approach,arena,guest)['coop']['enemies'][0]['hp']==spec['hp']
    for client,save in zip((host,guest),saves):
        frame=client.frame(restore=save,checkpoint=True)
        assert frame['story']['node']=='natlan-hub'
        assert frame['checkpoint']['endgame']['bosses'][id]['clears']==1
        if quest:
            with LOCK:
                current=SESSIONS[client.sid]['state']
                before=balances(current)
            for _ in range(2):
                report=client.frame(['story_report:'+quest],checkpoint=True)
            assert report['story']['quests'][quest]['status']=='complete'
            with LOCK:
                assert difference(balances(current),before)==report_rewards(QUESTS[quest])
            assert client.frame(restore=report['checkpoint'])['story']['quests'][quest]['status']=='complete'
    return dict(players=2,individualPhaseTransfers=True,independentLevelGate=True,
                pausedOnRetreat=True,onePartyWipeKeepsFight=True,fullRoomWipeResets=True,
                rematchAfterEveryoneLeaves=True,personalRewardsRestored=True)


if __name__=='__main__':
    subprocess.run([sys.executable,'-X','utf8',str(ROOT/'test_natlan_night_trials.py')],check=True)
    lua,core=runtime()
    proof={}
    for id in HOSTS:
        checks=shared_attacks(lua,core,id)
        checks['departingPartyReceivesNoLateKillCredit']=outgoing_reward(lua,core,SPECS[id])
        proof[id]={'lua':checks}
    with lab() as url:
        for id,host in HOSTS.items():
            proof[id]['http']=http_trial(url,id,host)
    (ROOT/'evidence/coop-natlan-night-trials-lua-http.json').write_text(
        json.dumps(proof,indent=2)+'\n',encoding='utf8')
    print(proof)
