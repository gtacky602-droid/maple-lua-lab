"""Exercise the personal rescue and waterway progress through two shared fights."""
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


SNOW, CAMP = 'snezhnaya-hub', 'novokichev-camp'
MOUSE, TREE, BEASTS = ('legend-snez_ancient_ironquill', 'legend-snez_elder_blighttree', 'legend-snez_rowdy_beast_host')
MOUSE_Q, TREE_Q, BEASTS_Q = ('sne-rescue-three-mice', 'sne-crystal-stream-survey', 'sne-suspicious-lantern')
FISSURE, = SPECS[MOUSE]['entryThrough']
JUNCTION, GALLERY = SPECS[TREE]['entryThrough']
ALLEY = SPECS[BEASTS]['entryThrough'][1]
MOUSE_ROUTE = (SNOW, 'sne-wp-100674', 'sne-wp-100679', 'sne-wp-106182', 'sne-wp-106183',
               'sne-wp-106191', 'sne-wp-106193', 'sne-wp-106194', FISSURE)
NORTH_ROUTE = ('sne-wp-106194', 'sne-north-works', 'sne-wp-106192', 'sne-wp-106206', CAMP)
MINE_ROUTE = (CAMP, 'sne-wp-106204', 'sne-wp-106183', 'sne-wp-106220', 'sne-wp-106186', JUNCTION)


def inspect_steps(client, quest, start=0, stop=None):
    for index, spot in enumerate(QUESTS[quest]['itinerary'][start:stop], start + 1):
        assert collect(client, spot)['story']['quests'][quest]['count'] == index


def report(client, quest):
    with LOCK:
        state = SESSIONS[client.sid]['state']
        before = balances(state)
    for _ in range(2):
        result = client.frame(['story_report:' + quest], checkpoint=True)
    assert result['story']['quests'][quest]['status'] == 'complete'
    with LOCK:
        assert difference(balances(state), before) == report_rewards(QUESTS[quest])
    return result['checkpoint']


def journey(url):
    host, guest = clients = (Client(url), Client(url))
    for client in clients:
        client.frame(['story_start'])
        with LOCK:
            env = SESSIONS[client.sid]
            core, state = env['core'], env['state']
            level(core, state, 160)
            core.enterStoryNode(state, SNOW)
            core.action(state, 'story_accept:' + MOUSE_Q)
    code = host.frame(['coop_create'])['coop']['code']
    assert guest.frame(['coop_join:' + code])['coop']['code'] == code
    for client, peer in ((host, guest), (guest, host)):
        go(client, peer, MOUSE_ROUTE, code)
    inspect_steps(guest, MOUSE_Q, stop=2)
    inspect_steps(host, MOUSE_Q)
    den = SPECS[MOUSE]['node']
    cross_route(host, (FISSURE, den), code)
    blocked = locked_gate(guest, FISSURE, den, '三匹')
    assert blocked['story']['quests'][MOUSE_Q]['count'] == 2
    assert blocked['coop']['peers'][0]['map'] == den
    partial = guest.frame(checkpoint=True)['checkpoint']
    resumed = guest.frame(restore=partial)
    assert resumed['story']['node'] == SNOW and resumed['story']['quests'][MOUSE_Q]['count'] == 2
    assert guest.frame(['coop_join:' + code])['coop']['code'] == code
    go(guest, host, MOUSE_ROUTE, code)
    inspect_steps(guest, MOUSE_Q, start=2)
    cross_route(host, (den, FISSURE), code)
    mouse = encounter(host, guest, MOUSE, FISSURE, code)
    for client, peer in ((host, guest), (guest, host)):
        with LOCK:
            env = SESSIONS[client.sid]
            level(env['core'], env['state'], 200)
        go(client, peer, (FISSURE, *NORTH_ROUTE), code)
        for quest in (TREE_Q, BEASTS_Q):
            assert client.frame(['story_accept:' + quest])['story']['quests'][quest]['count'] == 0
        go(client, peer, MINE_ROUTE, code)

    locked_gate(guest, JUNCTION, GALLERY, '水位表')
    inspect_steps(host, TREE_Q, stop=1)
    cross_route(host, (JUNCTION, GALLERY), code)
    assert locked_gate(guest, JUNCTION, GALLERY, '水位表')['story']['quests'][TREE_Q]['count'] == 0
    inspect_steps(guest, TREE_Q, stop=1)
    cross_route(guest, (JUNCTION, GALLERY), code)
    inspect_steps(host, TREE_Q, start=1)
    refuge = SPECS[TREE]['node']
    cross_route(host, (GALLERY, refuge), code)
    assert locked_gate(guest, GALLERY, refuge, '水門')['story']['quests'][TREE_Q]['count'] == 1
    inspect_steps(guest, TREE_Q, start=1)
    cross_route(host, (refuge, GALLERY), code)
    tree = encounter(host, guest, TREE, GALLERY, code)
    for client in clients:
        cross_route(client, (GALLERY, JUNCTION, ALLEY), code)
        inspect_steps(client, BEASTS_Q)
        arena = cross_route(client, (ALLEY, SPECS[BEASTS]['node']), code)
        assert sorted(e['hp'] for e in arena['coop']['enemies']) == [740, 870, 1000]
    for client in clients:
        save = client.frame(checkpoint=True)['checkpoint']
        assert all(save['endgame']['bosses'][id]['clears'] == 1 for id in (MOUSE, TREE))
        assert client.frame(restore=save)['story']['node'] == CAMP
        report(client, TREE_Q)
        assert client.frame(['story_fast:' + SNOW])['story']['node'] == SNOW
        restored = client.frame(restore=report(client, MOUSE_Q))
        assert all(restored['story']['quests'][id]['status'] == 'complete' for id in (MOUSE_Q, TREE_Q))
    return dict(participants=2, mouse=mouse, tree=tree, partialRescueRestoredAtSnowTown=True,
                personalWaterwayGates=True, sameRoomViaNorthWorks=True, sharedAccessToOreYard=True,
                bothReportsRestored=True)


if __name__ == '__main__':
    subprocess.run([sys.executable, '-X', 'utf8', str(ROOT / 'test_snez_late_field_legends.py')], check=True)
    lua, core = runtime()
    proof = {'lua': {id: shared_attacks(lua, core, id) for id in (MOUSE, TREE)}}
    with lab() as url:
        proof['http'] = journey(url)
    (ROOT / 'evidence/coop-snez-late-field-legends-lua-http.json').write_text(
        json.dumps(proof, indent=2) + '\n', encoding='utf8')
    print(proof)
