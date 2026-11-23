"""Verify both Wayob trials along a connected route in the same room."""
import json
import subprocess
import sys

from runtime import ROOT, runtime
from test_coop_branch_legends import SPECS, actor_at, level
from test_coop_local import Client, LOCK, SESSIONS, lab
from test_coop_natlan_entry_legends import shared_attacks
from test_coop_natlan_night_trials import http_trial, outgoing_reward, timed_travel
from test_coop_natlan_north_trials import collect
from test_coop_ruin_guardians import QUESTS, cross, edge


POTAPO='legend-natlan_potapo'
TUPAYO='legend-natlan_tupayo'
QUEST='natlan-two-pillar-trails'
WATER_HOST='nat-wp-79051'
WATER='stadium-west-waterfall-foot'
CLIFF_HOST='nat-wp-79542'
CLIFF='flower-feather-statue-back-cliff'
CONNECTOR=(WATER_HOST,'nat-wp-72429','natlan-field','natlan-port',CLIFF_HOST)


def step(client,source,target,code):
    frame=cross(client,edge(source,target))
    assert frame['coop']['shared'] and frame['coop']['code']==code
    return frame


def prepare_trails(host,guest,origin,approach):
    code=host.frame()['coop']['code']
    water_sign,cliff_sign=QUESTS[QUEST]['itinerary']
    for client in (host,guest):
        assert client.frame()['story']['quests'][QUEST]['count']==0
        waterfall=step(client,origin,WATER,code)
        assert waterfall['actors'][0]['y']==335
        assert collect(client,water_sign)['story']['quests'][QUEST]['count']==1
        step(client,WATER,origin,code)
        for source,target in zip(CONNECTOR,CONNECTOR[1:]):
            step(client,source,target,code)
        step(client,CLIFF_HOST,CLIFF,code)
        cliff_gate=edge(CLIFF,SPECS[TUPAYO]['node'])
        with LOCK:
            actor_at(SESSIONS[client.sid]['state'],cliff_gate['x'],480)
        blocked=client.frame(['story_portal:'+cliff_gate['to']])
        assert blocked['story']['node']==CLIFF and 'storyLift' not in blocked
        assert collect(client,cliff_sign)['story']['quests'][QUEST]['count']==2
        if approach==WATER:
            step(client,CLIFF,CLIFF_HOST,code)
            for source,target in zip(reversed(CONNECTOR[1:]),reversed(CONNECTOR[:-1])):
                step(client,source,target,code)
            step(client,WATER_HOST,WATER,code)


def enter_without_survey(url):
    host,guest=Client(url),Client(url)
    for client in (host,guest):
        client.frame()
        with LOCK:
            env=SESSIONS[client.sid]
            core,state=env['core'],env['state']
            core.action(state,'story_start')
            core.enterStoryNode(state,'natlan-hub')
            level(core,state,118)
            core.enterStoryNode(state,WATER_HOST)
    code=host.frame(['coop_create'])['coop']['code']
    assert guest.frame(['coop_join:'+code])['coop']['code']==code
    for client in (host,guest):
        step(client,WATER_HOST,WATER,code)
    for client,other in ((host,guest),(guest,host)):
        arrived=timed_travel(client,WATER,SPECS[POTAPO]['node'],other)
        assert arrived['coop']['code']==code and QUEST not in arrived['story']['quests']


if __name__=='__main__':
    subprocess.run([sys.executable,'-X','utf8',str(ROOT/'test_natlan_wayob_duo.py')],check=True)
    lua,core=runtime()
    proof={}
    for id in (POTAPO,TUPAYO):
        result=shared_attacks(lua,core,id)
        result['departingPartyReceivesNoLateKillCredit']=outgoing_reward(lua,core,SPECS[id])
        proof[id]={'lua':result}
    with lab() as url:
        enter_without_survey(url)
        for id in (POTAPO,TUPAYO):
            proof[id]['http']=http_trial(url,id,WATER_HOST,prepare_trails,QUEST)
            proof[id]['http'].update(sharedRoomAcrossConnector=True,personalMarksAndReports=True)
    proof[POTAPO]['http']['entryWithoutSurveyChecked']=True
    proof[TUPAYO]['http']['sameHeightAfterDefeatAndExit']=274
    (ROOT/'evidence/coop-natlan-wayob-duo-lua-http.json').write_text(
        json.dumps(proof,indent=2)+'\n',encoding='utf8')
    print(proof)
