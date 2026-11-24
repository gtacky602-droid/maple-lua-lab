"""Verify both survey orders, peninsula entrances and shared northern field fights."""
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
from test_coop_nod_first_field_legends import go
from test_coop_ruin_guardians import QUESTS, balances


HUB = 'nod-north-harbor'
QUEST = 'nod-north-landmark-round'
LINK = ('nod-wp-88171', 'nod-wp-88168', 'nod-wp-92867', HUB)
EAST = (HUB, 'nod-wp-92868', 'nod-wp-92870', 'nod-wp-92871', 'nod-wp-92873', 'nod-wp-92877')
PENINSULA = (*EAST, 'nod-wp-92879', 'nod-wind-fort-peninsula')
ROUTES = {
    'coast': (HUB, 'nod-wp-92868', 'nod-wp-92874', 'nod-wp-92875', 'nod-pyramid-seaward-steps'),
    'peninsula': PENINSULA,
    'ridge': (*EAST, 'nod-wp-92883', 'nod-wp-92885', 'nod-wp-92866', 'nod-wp-92888',
              'nod-wp-92889', 'nod-aamsvaltnir-east-ridge'),
}
BOSSES = dict(zip(ROUTES, ('legend-nod_hexadecatonic_mandragora', 'legend-nod_hiljetta',
                          'legend-nod_homesick_lone_wolf')))
STEPS = {path['id']: path['steps'][0] for path in QUESTS[QUEST]['paths']}


def survey_flags(client):
    with LOCK:
        row = SESSIONS[client.sid]['state'].story.quests[QUEST]
        return {leg for leg in ROUTES if row.pathProgress[leg].count == 1}, row.count


def visit_survey(client, peer, order, code, *, alternate=False):
    recorded = set()
    for index, leg in enumerate(order):
        route = ROUTES[leg]
        if leg == 'peninsula' and alternate:
            route = (*route[:-1], 'nod-wp-92880', route[-1])
        go(client, peer, route, code)
        collect(client, STEPS[leg])
        recorded.add(leg)
        assert survey_flags(client) == (recorded, int(index == len(order) - 1))
        go(client, peer, tuple(reversed(route)), code)


def journey(url):
    host, guest = clients = (Client(url), Client(url))
    for client in clients:
        client.frame(['story_start'])
        with LOCK:
            env = SESSIONS[client.sid]
            level(env['core'], env['state'], 140)
            env['core'].enterStoryNode(env['state'], LINK[0])
    code = host.frame(['coop_create'])['coop']['code']
    assert guest.frame(['coop_join:' + code])['coop']['code'] == code
    for client, peer in ((host, guest), (guest, host)):
        go(client, peer, LINK, code)
    wolf = SPECS[BOSSES['ridge']]['node']
    go(guest, host, (*ROUTES['ridge'], wolf), code)
    assert QUEST not in guest.frame()['story']['quests']
    go(guest, host, (wolf, *reversed(ROUTES['ridge'])), code)
    for client in clients:
        assert client.frame(['story_accept:' + QUEST])['story']['quests'][QUEST]['count'] == 0

    orders = ('coast', 'peninsula', 'ridge'), ('ridge', 'peninsula', 'coast')
    visit_survey(host, guest, orders[0], code)
    assert survey_flags(guest) == (set(), 0)
    visit_survey(guest, host, orders[1], code, alternate=True)
    results = {}
    for leg, route in ROUTES.items():
        for client, peer in ((host, guest), (guest, host)):
            go(client, peer, route, code)
        results[leg] = encounter(host, guest, BOSSES[leg], route[-1], code)
        for client, peer in ((host, guest), (guest, host)):
            go(client, peer, tuple(reversed(route)), code)
    for client in clients:
        save = client.frame(checkpoint=True)['checkpoint']
        assert all(save['endgame']['bosses'][id]['clears'] == 1 for id in BOSSES.values())
        assert client.frame(restore=save)['story']['node'] == HUB
        with LOCK:
            state = SESSIONS[client.sid]['state']
            before = balances(state)
        for _ in range(2):
            report = client.frame(['story_report:' + QUEST], checkpoint=True)
        assert report['story']['quests'][QUEST]['status'] == 'complete'
        with LOCK:
            assert difference(balances(state), before) == report_rewards(QUESTS[QUEST])
        assert client.frame(restore=report['checkpoint'])['story']['quests'][QUEST]['status'] == 'complete'
    return dict(participants=2, mainIslandTravel=True, ungatedWolfBeforeSurvey=True, peninsulaEntrances=2,
                independentSurveyOrders=orders, bothReportsRestored=True, encounters=results)


if __name__ == '__main__':
    subprocess.run([sys.executable, '-X', 'utf8', str(ROOT / 'test_nod_north_field_legends.py')], check=True)
    lua, core = runtime()
    proof = {'lua': {id: shared_attacks(lua, core, id) for id in BOSSES.values()}}
    with lab() as url:
        proof['http'] = journey(url)
    (ROOT / 'evidence/coop-nod-north-field-legends-lua-http.json').write_text(
        json.dumps(proof, indent=2) + '\n', encoding='utf8')
    print(proof)
