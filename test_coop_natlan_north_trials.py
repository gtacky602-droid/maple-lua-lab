"""Check that night trial rooms preserve each player's entrance puzzle."""
import json
import subprocess
import sys

from runtime import ROOT, runtime
from test_coop_branch_legends import NODES, SPECS, actor_at
from test_coop_local import LOCK, SESSIONS, lab
from test_coop_natlan_entry_legends import locked, shared_attacks
from test_coop_natlan_night_trials import http_trial, outgoing_reward, timed_travel
from test_coop_ruin_guardians import QUESTS, cross, edge


TLATZA='legend-natlan_tlatzacuilotl'
ICHCA='legend-natlan_ichcahuipilli'
STONES='natlan-sulfurous-resonant-stones'
ECHOES='natlan-witztli-three-echoes'


def collect(client,spot):
    with LOCK:
        s=SESSIONS[client.sid]['state']
        actor_at(s,spot['x'],spot['y'])
    return client.frame(['story_collect'])


def prepare_stones(host,guest,host_node,cave):
    lower,basin,_=SPECS[TLATZA]['entryThrough']
    gate=edge(basin,cave)
    config=NODES[basin]['resonance']
    code=host.frame()['coop']['code']
    order=[config['stones'][i-1] for i in config['order']]
    for client,other in ((host,guest),(guest,host)):
        assert timed_travel(client,host_node,lower,other)['coop']['code']==code
        assert cross(client,edge(lower,basin))['coop']['shared']
    locked(host,gate,'刻印板')
    assert '消えました' in collect(host,order[-1])['storyNotice']
    for client in (host,guest):
        locked(client,gate,'刻印板')
        for stone in order:
            settled=collect(client,stone)
        assert settled['story']['quests'][STONES]['count']==1
        assert cross(client,gate)['coop']['shared']


def prepare_echoes(host,guest,host_node,bank):
    arena=SPECS[ICHCA]['node']
    gate=edge(bank,arena)
    quest=QUESTS[ECHOES]
    for client in (host,guest):
        assert cross(client,edge(host_node,bank))['coop']['shared']
    locked(host,gate,'三つの光')
    paths=quest['paths']
    first=paths[0]['steps'][0]['node']
    assert cross(guest,edge(bank,first))['coop']['shared']
    frame=cross(guest,edge(first,bank))
    assert frame['story']['quests'][ECHOES]['pathProgress'][paths[0]['id']]['count']==0
    for client,order in ((host,paths),(guest,reversed(paths))):
        assert client.frame()['story']['quests'][ECHOES]['count']==1
        reason='三つの光' if client is host else str(SPECS[ICHCA]['level'])
        locked(client,gate,reason)
        for path in order:
            spot=path['steps'][0]
            assert cross(client,edge(bank,spot['node']))['coop']['shared']
            picked=collect(client,spot)
            assert picked['story']['quests'][ECHOES]['pathProgress'][path['id']]['count']==1
            returned=cross(client,edge(spot['node'],bank))
            assert returned['story']['quests'][ECHOES]['pathProgress'][path['id']]['count']==2
        assert returned['story']['quests'][ECHOES]['count']==2


if __name__=='__main__':
    subprocess.run([sys.executable,'-X','utf8',str(ROOT/'test_natlan_north_trials.py')],check=True)
    lua,core=runtime()
    proof={}
    for id in (TLATZA,ICHCA):
        check=shared_attacks(lua,core,id)
        check['departingPartyReceivesNoLateKillCredit']=outgoing_reward(lua,core,SPECS[id])
        proof[id]={'lua':check}
    with lab() as url:
        stone=http_trial(url,TLATZA,'nat-wp-72434',prepare_stones,STONES)
        stone.update(personalResonanceAndCaveGate=True, wrongOrderRejected=True, bothQuestReportsRestored=True)
        echoes=http_trial(url,ICHCA,'nat-wp-72436',prepare_echoes,ECHOES)
        echoes.update(personalThreeReturnsAndRockSeal=True, emptyReturnDoesNotCount=True, bothQuestReportsRestored=True)
        proof[TLATZA]['http']=stone
        proof[ICHCA]['http']=echoes
    (ROOT/'evidence/coop-natlan-north-trials-lua-http.json').write_text(
        json.dumps(proof,indent=2)+'\n',encoding='utf8')
    print(proof)
