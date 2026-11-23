"""Check the cliff routes, Traveler-only parties, and co-op trial rewards."""
import json
import subprocess
import sys

from runtime import ROOT, runtime
from test_coop_branch_legends import SPECS, actor_at, level
from test_coop_local import Client, LOCK, SESSIONS, advance, lab
from test_coop_natlan_entry_legends import locked, shared_attacks
from test_coop_natlan_night_trials import http_trial, outgoing_reward, timed_travel
from test_coop_natlan_north_trials import collect
from test_coop_ruin_guardians import QUESTS, cross, edge


ATLATL='legend-natlan_atlatl'
CIHUA='legend-natlan_cihuacoatl'
WALL='natlan-ancient-excavation-wall'


def prepare_wall(host,guest,host_node,ledge):
    wall=SPECS[ATLATL]['entryThrough'][0]
    first,_,last=QUESTS[WALL]['itinerary']
    for client in (host,guest):
        assert cross(client,edge(host_node,wall))['coop']['shared']
    for client,peer in ((host,guest),(guest,host)):
        assert client.frame()['story']['quests'][WALL]['count']==0
        assert collect(client,first)['story']['quests'][WALL]['count']==1
        arrived=timed_travel(client,wall,ledge,peer)
        assert arrived['actors'][0]['y']==272
        assert arrived['story']['quests'][WALL]['count']==2
        assert collect(client,last)['story']['quests'][WALL]['count']==3


def prepare_plateau(host,guest,host_node,plateau):
    arena=SPECS[CIHUA]['node']
    gate=edge(plateau,arena)
    for client in (host,guest):
        assert cross(client,edge(host_node,plateau))['coop']['shared']
        with LOCK:
            actor_at(SESSIONS[client.sid]['state'],gate['x'],480)
        frame=client.frame(['story_portal:'+arena])
        assert frame['story']['node']==plateau and 'storyLift' not in frame


def atlatl_mid_trial_join(url):
    spec=SPECS[ATLATL]
    arena,ledge=spec['node'],spec['entryThrough'][-1]
    host,guest=Client(url),Client(url)
    for client in (host,guest):
        client.frame()
        with LOCK:
            env=SESSIONS[client.sid]
            core,state=env['core'],env['state']
            core.action(state,'story_start')
            core.enterStoryNode(state,'natlan-hub')
            level(core,state,spec['level'])
            core.enterStoryNode(state,ledge)
    with LOCK:
        original=SESSIONS[guest.sid]['state']
        original.active=2
        original.actors[1].hp=0
    locked(guest,edge(ledge,arena),'旅人')
    with LOCK:
        original.actors[1].hp=original.actors[1].maxhp
        original.actors[2].hp=73

    for client,peer in ((host,guest),(guest,host)):
        entered=timed_travel(client,ledge,arena,peer,shared=False)
        assert entered['storyTravelerTrial'] and entered['active']==1
        assert entered['actors'][1]['hp']==0
    code=host.frame(['coop_create'])['coop']['code']
    joined=guest.frame(['coop_join:'+code],checkpoint=True)
    assert joined['coop']['shared'] and joined['checkpoint']['active']==2
    assert joined['actors'][1]['hp']==0 and joined['storyTravelerTrial']
    assert [actor['hp'] for actor in joined['coop']['peers'][0]['actors']][1]==0
    left=timed_travel(guest,arena,ledge,host)
    assert left['active']==2 and left['actors'][1]['hp']==73 and not left.get('storyTravelerTrial')
    assert left['actors'][0]['y']==272
    reentered=timed_travel(guest,ledge,arena,host)
    assert reentered['actors'][1]['hp']==0 and reentered['active']==1
    with LOCK:
        SESSIONS[guest.sid]['state'].actors[1].hp=0
    still_fighting,returned=advance(host,guest,.12)
    assert still_fighting['story']['node']==arena and still_fighting['returns']==0
    assert returned['story']['node']==ledge and returned['returns']==1
    assert returned['active']==2 and returned['actors'][1]['hp']==73
    assert returned['actors'][1]['y']==272
    return dict(downedTravelerGate=True,bothTravelersOnly=True,
                previousActorSurvivesJoin=True,allyHPPreservedOnExitAndDefeat=True)


if __name__=='__main__':
    subprocess.run([sys.executable,'-X','utf8',str(ROOT/'test_natlan_cliff_trials.py')],check=True)
    lua,core=runtime()
    proof={}
    for id in (ATLATL,CIHUA):
        checks=shared_attacks(lua,core,id)
        checks['departingPartyReceivesNoLateKillCredit']=outgoing_reward(lua,core,SPECS[id])
        proof[id]={'lua':checks}
    with lab() as url:
        atlatl=http_trial(url,ATLATL,'nat-wp-72414',prepare_wall,WALL)
        atlatl.update(wallCrossingAndMarksArePersonal=True,bothQuestReportsRestored=True)
        atlatl.update(atlatl_mid_trial_join(url))
        cihua=http_trial(url,CIHUA,'nat-wp-72759',prepare_plateau)
        cihua.update(groundCannotUseHighGate=True)
        proof[ATLATL]['http']=atlatl
        proof[CIHUA]['http']=cihua
    (ROOT/'evidence/coop-natlan-cliff-trials-lua-http.json').write_text(
        json.dumps(proof,indent=2)+'\n',encoding='utf8')
    print(proof)
