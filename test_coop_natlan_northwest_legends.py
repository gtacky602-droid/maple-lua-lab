"""Test the two branches off the cliff and the night trial above the smithy."""
import json
import subprocess
import sys

from runtime import ROOT, runtime
from test_coop_branch_legends import SPECS, actor_at, hit, level, via_http
from test_coop_local import Client, LOCK, SESSIONS, advance, lab
from test_coop_natlan_entry_legends import shared_attacks
from test_coop_natlan_night_trials import http_trial, outgoing_reward, timed_travel
from test_coop_natlan_north_trials import collect
from test_coop_ruin_guardians import QUESTS, cross, edge


WEST='nat-wp-79053'
FORK='night-wind-seaward-fork'
RILAI='legend-natlan_rilai'
DAWN='legend-natlan_fallen_dawnstar'
IRON='legend-natlan_ironbeard'
SIGNS='natlan-seaward-signs'


def prepare_dawn(host,guest,west,fork):
    quest=QUESTS[SIGNS]
    for client in (host,guest):
        assert cross(client,edge(west,fork))['coop']['shared']
    for client in (host,guest):
        assert client.frame()['story']['quests'][SIGNS]['count']==0
        for index,spot in enumerate(quest['itinerary'],1):
            assert collect(client,spot)['story']['quests'][SIGNS]['count']==index


def split_cliff(url):
    host,guest=Client(url),Client(url)
    rilai,dawn=SPECS[RILAI],SPECS[DAWN]
    for client in (host,guest):
        client.frame()
        with LOCK:
            env=SESSIONS[client.sid]
            core,state=env['core'],env['state']
            core.action(state,'story_start')
            core.enterStoryNode(state,'natlan-hub')
            level(core,state,120)
            core.enterStoryNode(state,WEST)
    code=host.frame(['coop_create'])['coop']['code']
    assert guest.frame(['coop_join:'+code])['coop']['code']==code
    for client in (host,guest):
        assert cross(client,edge(WEST,FORK))['coop']['shared']
    assert cross(host,edge(FORK,rilai['node']))['coop']['shared']
    arrival=timed_travel(guest,FORK,dawn['node'],host)
    assert arrival['coop']['code']==code and arrival['coop']['peers'][0]['map']==rilai['node']

    with LOCK:
        env=SESSIONS[host.sid]
        core,lua,state=env['core'],env['lua'],env['state']
        other=SESSIONS[guest.sid]['state']
        body=state.coop.fieldSlot.enemy
        a=actor_at(state,body.x-58)
        a.dir=1
        other.actors[2].hp=0
    waiting,trial=advance(host,guest,.27)
    assert waiting['fieldBoss']['phase']=='available' and waiting['fieldBoss']['hp']==rilai['hp']
    assert waiting['coop']['peers'][0]['map']==dawn['node'] and not waiting['coop']['peers'][0]['actors']
    host.frame(['normal'])
    fighting,trial=advance(host,guest,.4)
    assert 0<fighting['fieldBoss']['hp']<rilai['hp']
    assert trial['coop']['enemies'][0]['hp']==dawn['hp']
    with LOCK:
        actor_at(state,body.x)
        hit(lua,core,state,body,power=10000)
    first=host.frame(checkpoint=True)
    second=guest.frame(checkpoint=True)
    assert first['checkpoint']['endgame']['bosses'][RILAI]['clears']==1
    assert second['kills']==0 and second['mora']==0 and second['coop']['enemies'][0]['hp']==dawn['hp']
    assert RILAI not in second['checkpoint'].get('endgame',{}).get('bosses',{})
    stayed=timed_travel(guest,dawn['node'],FORK,host)
    assert stayed['actors'][0]['y']==346
    assert cross(guest,edge(FORK,rilai['node']))['coop']['enemies'][0]['hp']==0
    for client in (host,guest):
        cross(client,edge(rilai['node'],FORK))
    restarted=cross(host,edge(FORK,rilai['node']))
    assert restarted['coop']['enemies'][0]['hp']==rilai['hp']
    with LOCK:
        assert state.coop.fieldSlot.enemy.noAutoTarget
    return dict(sharedRoomDifferentArenas=True, neutralWithCompanion=True, normalAttackProvokes=True,
                independentHealthAndLoot=True, canRegroupAfterClear=True, rematchRestoresNeutral=True)


if __name__=='__main__':
    subprocess.run([sys.executable,'-X','utf8',str(ROOT/'test_natlan_northwest_legends.py')],check=True)
    lua,core=runtime()
    proof={}
    for id in (RILAI,DAWN,IRON):
        results=shared_attacks(lua,core,id)
        if id!=RILAI:
            results['departingPartyReceivesNoLateKillCredit']=outgoing_reward(lua,core,SPECS[id])
        proof[id]={'lua':results}
    with lab() as url:
        via_http(url,RILAI,check_level=True)
        proof[RILAI]['http']=split_cliff(url)
        proof[RILAI]['http'].update(independentLevelGate=True, sharedGroundFightAndSaves=True)
        proof[DAWN]['http']=http_trial(url,DAWN,WEST,prepare_dawn,SIGNS)
        proof[IRON]['http']=http_trial(url,IRON,'natlan-port')
    (ROOT/'evidence/coop-natlan-northwest-legends-lua-http.json').write_text(
        json.dumps(proof,indent=2)+'\n',encoding='utf8')
    print(proof)
