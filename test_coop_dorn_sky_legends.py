"""Verify the bay crossing and each party's survey of the sand pavilion."""
import json
import subprocess
import sys

from runtime import ROOT, runtime
from test_coop_branch_legends import SPECS, level
from test_coop_late_branch_bosses import difference, report_rewards
from test_coop_local import Client, LOCK, SESSIONS, lab
from test_coop_natlan_atocpan_totem import cross_route
from test_coop_natlan_entry_legends import shared_attacks
from test_coop_natlan_final_legends import encounter
from test_coop_natlan_north_trials import collect
from test_coop_nod_first_field_legends import go, locked_gate
from test_coop_ruin_guardians import QUESTS, balances


CHUR = 'legend-mondstadt_churldric'
MAHA = 'legend-mondstadt_maha_vasudevayaputra'
QUEST = 'sky-pavilion-notes'
DORN, SKY = 'dornman-camp', 'nat-sky-camp'
DORN_ROUTE = (DORN, 'mond-wp-95782', 'mond-wp-95795', 'mond-wp-95794', 'mond-wp-95793',
              'mond-wp-95792', 'dorn-shieldrol-lake-trail')
SKY_LINK = ('nat-wp-84109', 'nat-wp-84110', SKY)
SKY_ROUTE = (SKY, 'nat-wp-96366', 'nat-wp-96367', 'nat-wp-96373', 'nat-wp-96375', 'nat-wp-96376',
             'nat-wp-96378', 'nat-wp-96377', 'sky-sand-pavilion-walk')


def create_room(url, origin, id):
    host, guest = (Client(url), Client(url))
    for client in (host, guest):
        client.frame(['story_start'])
        with LOCK:
            env = SESSIONS[client.sid]
            core, state = env['core'], env['state']
            level(core, state, SPECS[id]['level'] - int(client is guest))
            core.enterStoryNode(state, origin)
    code = host.frame(['coop_create'])['coop']['code']
    assert guest.frame(['coop_join:' + code])['coop']['code'] == code
    return host, guest, code


def restore_clear(client, id, hub):
    snapshot = client.frame(checkpoint=True)['checkpoint']
    assert snapshot['endgame']['bosses'][id]['clears'] == 1
    assert client.frame(restore=snapshot)['story']['node'] == hub


def churldric(url):
    host, guest, code = create_room(url, DORN, CHUR)
    for client, peer in ((host, guest), (guest, host)):
        go(client, peer, DORN_ROUTE, code)
        assert not client.frame()['story']['quests']
    result = encounter(host, guest, CHUR, DORN_ROUTE[-1], code, check_level=True)
    for client, peer in ((host, guest), (guest, host)):
        go(client, peer, tuple(reversed(DORN_ROUTE)), code)
        restore_clear(client, CHUR, DORN)
    return dict(**result, sharedBayCrossingAndReturn=True, ungatedByQuest=True, savedClearRestored=True)


def maha(url):
    host, guest, code = create_room(url, SKY_LINK[0], MAHA)
    for client, peer in ((host, guest), (guest, host)):
        go(client, peer, SKY_LINK, code)
        assert client.frame(['story_accept:' + QUEST])['story']['quests'][QUEST]['count'] == 0
        go(client, peer, SKY_ROUTE, code)
    entry = SKY_ROUTE[-1]
    arena = SPECS[MAHA]['node']
    locked_gate(guest, entry, arena, '185')
    with LOCK:
        env = SESSIONS[guest.sid]
        level(env['core'], env['state'], 185)
    steps = QUESTS[QUEST]['itinerary']
    for index, spot in enumerate(steps[:2], 1):
        assert collect(guest, spot)['story']['quests'][QUEST]['count'] == index
    for index, spot in enumerate(steps, 1):
        assert collect(host, spot)['story']['quests'][QUEST]['count'] == index
    cross_route(host, (entry, arena), code)
    denied = locked_gate(guest, entry, arena, 'マーダヴァ')
    assert denied['story']['quests'][QUEST]['count'] == 2 and denied['coop']['peers'][0]['map'] == arena
    snapshot = guest.frame(checkpoint=True)['checkpoint']
    resumed = guest.frame(restore=snapshot)
    assert resumed['story']['node'] == SKY and resumed['story']['quests'][QUEST]['count'] == 2
    assert guest.frame(['coop_join:' + code])['coop']['code'] == code
    go(guest, host, SKY_ROUTE, code)
    assert collect(guest, steps[2])['story']['quests'][QUEST]['count'] == 3
    cross_route(host, (arena, entry), code)
    result = encounter(host, guest, MAHA, entry, code)
    for client, peer in ((host, guest), (guest, host)):
        go(client, peer, (entry, SKY_ROUTE[-2]), code)
        assert client.frame()['actors'][0]['y'] == 365
        restore_clear(client, MAHA, SKY)
        with LOCK:
            state = SESSIONS[client.sid]['state']
            before = balances(state)
        for _ in range(2):
            report = client.frame(['story_report:' + QUEST], checkpoint=True)
        assert report['story']['quests'][QUEST]['status'] == 'complete'
        with LOCK:
            assert difference(balances(state), before) == report_rewards(QUESTS[QUEST])
        assert client.frame(restore=report['checkpoint'])['story']['quests'][QUEST]['status'] == 'complete'
    return dict(**result, independentLevelGate=True, independentSurveyGate=True, partialSurveyRestored=True,
                sharedTempleLifts=True, bothReportsRestored=True)


if __name__ == '__main__':
    subprocess.run([sys.executable, '-X', 'utf8', str(ROOT / 'test_final_field_legends.py')], check=True)
    lua, core = runtime()
    proof = {'lua': {id: shared_attacks(lua, core, id) for id in (CHUR, MAHA)}, 'http': {}}
    with lab() as url:
        for check in (churldric, maha):
            proof['http'][check.__name__] = check(url)
            print('HTTP:', check.__name__, 'travel, gates and shared fight passed', flush=True)
    (ROOT / 'evidence/coop-dorn-sky-legends-lua-http.json').write_text(
        json.dumps(proof, indent=2) + '\n', encoding='utf8')
    print(proof)
