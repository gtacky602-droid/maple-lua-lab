"""Verify the mainland and ferry routes for the shared Atocpan trials."""
import json
import subprocess
import sys

from runtime import ROOT, runtime
from test_coop_branch_legends import SPECS, actor_at
from test_coop_local import LOCK, SESSIONS, lab
from test_coop_natlan_entry_legends import shared_attacks
from test_coop_natlan_night_trials import http_trial, outgoing_reward, timed_travel
from test_coop_natlan_north_trials import collect
from test_coop_ruin_guardians import QUESTS, cross, edge


REJI = 'legend-natlan_reji'
TUPU = 'legend-natlan_tupu'
QUEST = 'natlan-atocpan-landmarks'
NORTH = ('nat-wp-79051', 'nat-wp-82572', 'nat-wp-82558', 'nat-wp-82559')
RIM = NORTH[-1]
RUINS = 'tetenanco-seaward-foot'
MAINLAND = (RIM, 'nat-wp-82557', 'nat-wp-82560', 'nat-wp-82561', 'nat-wp-82562')
VALLEY = MAINLAND[-1]
ISLAND = 'nat-wp-82563'
HEADLAND = 'collective-eastern-headland'


def cross_route(client, route, code):
    for source, target in zip(route, route[1:]):
        frame = cross(client, edge(source, target))
        assert frame['coop']['shared'] and frame['coop']['code'] == code
        assert frame['coop']['map'] == target
    return frame


def prepare_landmarks(host, guest, origin, approach):
    assert origin == NORTH[0]
    code = host.frame()['coop']['code']
    hillside, cape = QUESTS[QUEST]['itinerary']
    for client in (host, guest):
        cross_route(client, NORTH, code)
        arrival = cross_route(client, (RIM, RUINS), code)
        assert arrival['actors'][0]['y'] == 414
        assert arrival['story']['quests'][QUEST]['count'] == 0
        assert collect(client, hillside)['story']['quests'][QUEST]['count'] == 1
        cross_route(client, (RUINS, *MAINLAND), code)

    on_foot = cross_route(host, (VALLEY, HEADLAND), code)
    assert on_foot['actors'][0]['x'] == 155
    island = timed_travel(guest, VALLEY, ISLAND, host)
    assert island['coop']['code'] == code and island['coop']['peers'][0]['map'] == HEADLAND
    by_boat = timed_travel(guest, ISLAND, HEADLAND, host)
    assert by_boat['coop']['code'] == code and by_boat['actors'][0]['x'] == 1392
    assert host.frame()['coop']['peers'][0]['map'] == HEADLAND

    gate = edge(HEADLAND, SPECS[TUPU]['node'])
    for client in (host, guest):
        assert client.frame()['story']['quests'][QUEST]['count'] == 1
        with LOCK:
            actor_at(SESSIONS[client.sid]['state'], gate['x'], 480)
        blocked = client.frame(['story_portal:' + gate['to']])
        assert blocked['story']['node'] == HEADLAND and 'storyLift' not in blocked
        assert collect(client, cape)['story']['quests'][QUEST]['count'] == 2

    if approach == RUINS:
        for source, target in ((HEADLAND, ISLAND), (ISLAND, VALLEY)):
            assert timed_travel(guest, source, target, host)['coop']['code'] == code
        cross_route(host, (HEADLAND, VALLEY), code)
        for client in (host, guest):
            cross_route(client, (*reversed(MAINLAND), RUINS), code)


if __name__ == '__main__':
    subprocess.run([sys.executable, '-X', 'utf8', str(ROOT / 'test_natlan_atocpan_totem.py')], check=True)
    lua, core = runtime()
    proof = {}
    for id in (REJI, TUPU):
        result = shared_attacks(lua, core, id)
        result['departingPartyReceivesNoLateKillCredit'] = outgoing_reward(lua, core, SPECS[id])
        proof[id] = {'lua': result}
    with lab() as url:
        for id in (REJI, TUPU):
            proof[id]['http'] = http_trial(url, id, NORTH[0], prepare_landmarks, QUEST)
            proof[id]['http'].update(northernConnection=True, footAndFerryRegroup=True,
                                     personalMarksAndReports=True)
    proof[REJI]['http']['ferryReturnChecked'] = True
    proof[TUPU]['http']['sameHeightAfterDefeatAndExit'] = 345
    (ROOT / 'evidence/coop-natlan-atocpan-totem-lua-http.json').write_text(
        json.dumps(proof, indent=2) + '\n', encoding='utf8')
    print(proof)
