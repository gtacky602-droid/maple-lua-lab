"""Exercise personal offerings, mirror geometry, and lift access in shared rooms."""
import json
import subprocess
import sys

from runtime import ROOT, runtime
from test_coop_branch_legends import SPECS, actor_at, level
from test_coop_late_branch_bosses import difference, report_rewards
from test_coop_local import Client, LOCK, SESSIONS, lab
from test_coop_natlan_atocpan_totem import cross_route
from test_coop_natlan_entry_legends import shared_attacks
from test_coop_natlan_final_legends import encounter
from test_coop_natlan_night_trials import timed_travel
from test_coop_natlan_north_trials import collect
from test_coop_ruin_guardians import QUESTS, balances, edge


TOWN = 'nod-town'
SIGURD, CRAB, RASKOL = ('legend-nod_sigurd', 'legend-nod_crab_tsar', 'legend-nod_raskolnikov')
CASES = {
    SIGURD: ('nod-bonemos-offerings', (TOWN, 'nod-wp-88128', 'nod-wp-88147', 'nod-wp-88148',
                                     'nod-bonemos-grave-path')),
    CRAB: ('nod-hiisi-palace-mirrors', (TOWN, 'nod-field', 'nod-port', 'nod-wp-88139', 'nod-wp-88127',
                                      'nod-wp-88130', 'nod-wp-88131', 'nod-wp-88138', 'nod-hiisi-mirror-court')),
    RASKOL: ('nod-bureau-lift-check', (TOWN, 'nod-wp-88128', 'nod-wp-88147', 'nod-wp-88148', 'nod-wp-88154',
                                     'nod-wp-88155', 'nod-wp-88157', 'nod-wp-88160', 'nod-wp-88161',
                                     'nod-wp-88172', 'nod-wp-88174', 'nod-wp-88171', 'nod-bureau-upper-lift-station')),
}


def go(client, peer, route, code):
    for source, target in zip(route, route[1:]):
        if {'liftSeconds', 'boatSeconds'} & edge(source, target).keys():
            assert timed_travel(client, source, target, peer)['coop']['code'] == code
        else:
            cross_route(client, (source, target), code)


def locked_gate(client, entry, arena, reason):
    gate = edge(entry, arena)
    with LOCK:
        actor_at(SESSIONS[client.sid]['state'], gate['x'], gate.get('y', 480))
    blocked = client.frame(['story_portal:' + arena])
    assert blocked['story']['node'] == entry and 'storyLift' not in blocked
    assert reason in blocked['storyNearbyPortal']['reason']
    return blocked


def progress(client, quest):
    with LOCK:
        state = SESSIONS[client.sid]['state']
        row = state.story.quests[quest]
        bridge = any(p.moonDeck for p in state.platforms.values())
        return row.count, row.reflectAngle, bridge


def solve(client, quest, steps):
    for index, spot in enumerate(steps, 1):
        for _ in range(spot.get('reflect', {}).get('align', 1)):
            result = collect(client, spot)
        assert result['story']['quests'][quest]['count'] == index


def journey(url, id):
    spec = SPECS[id]
    quest, route = CASES[id]
    entry, arena = route[-1], spec['node']
    steps = QUESTS[quest]['itinerary']
    reason = {SIGURD: '供え物', CRAB: '二つの鏡', RASKOL: '操作盤'}[id]
    host, guest = clients = (Client(url), Client(url))
    for client in clients:
        client.frame(['story_start'])
        with LOCK:
            env = SESSIONS[client.sid]
            core, state = env['core'], env['state']
            core.enterStoryNode(state, TOWN)
            level(core, state, spec['level'] - int(client is guest))
            core.action(state, 'story_accept:' + quest)
    code = host.frame(['coop_create'])['coop']['code']
    assert guest.frame(['coop_join:' + code])['coop']['code'] == code
    for client, peer in ((host, guest), (guest, host)):
        go(client, peer, route, code)

    locked_gate(guest, entry, arena, str(spec['level']))
    with LOCK:
        env = SESSIONS[guest.sid]
        level(env['core'], env['state'], spec['level'])
    if id == CRAB:
        solve(guest, quest, steps[:1])
        collect(guest, steps[1])
        assert progress(guest, quest) == (1, 1, False)
    solve(host, quest, steps)
    go(host, guest, (entry, arena), code)
    blocked = locked_gate(guest, entry, arena, reason)
    assert blocked['coop']['peers'][0]['map'] == arena
    if id == CRAB:
        assert progress(guest, quest) == (1, 1, False)
        snapshot = guest.frame(checkpoint=True)['checkpoint']
        assert guest.frame(restore=snapshot)['story']['node'] == TOWN
        assert guest.frame(['coop_join:' + code])['coop']['code'] == code
        go(guest, host, route, code)
        assert progress(guest, quest) == (1, 1, False)
        for _ in range(2):
            collect(guest, steps[1])
        assert progress(guest, quest) == (2, None, True)
    else:
        assert blocked['story']['quests'][quest]['count'] == 0
        solve(guest, quest, steps)
    go(host, guest, (arena, entry), code)
    result = encounter(host, guest, id, entry, code)
    for client in clients:
        snapshot = client.frame(checkpoint=True)['checkpoint']
        assert client.frame(restore=snapshot)['story']['node'] == TOWN
        with LOCK:
            state = SESSIONS[client.sid]['state']
            assert state.endgame.bosses[id].clears == 1
            before = balances(state)
        for _ in range(2):
            report = client.frame(['story_report:' + quest], checkpoint=True)
        assert report['story']['quests'][quest]['status'] == 'complete'
        with LOCK:
            assert difference(balances(state), before) == report_rewards(QUESTS[quest])
        assert client.frame(restore=report['checkpoint'])['story']['quests'][quest]['status'] == 'complete'
    return dict(**result, independentLevelGate=True, independentQuestGate=True, personalReportsRestored=True,
                sharedTravelFromTown=True, **({'personalBridgeAndAngleRestore': True} if id == CRAB else {}))


if __name__ == '__main__':
    subprocess.run([sys.executable, '-X', 'utf8', str(ROOT / 'test_nod_first_field_legends.py')], check=True)
    lua, core = runtime()
    proof = {'lua': {id: shared_attacks(lua, core, id) for id in CASES}}
    with lab() as url:
        proof['http'] = {}
        for id in CASES:
            proof['http'][id] = journey(url, id)
            print('HTTP:', SPECS[id]['name'], 'travel, personal gate, combat and report passed', flush=True)
    (ROOT / 'evidence/coop-nod-first-field-legends-lua-http.json').write_text(
        json.dumps(proof, indent=2) + '\n', encoding='utf8')
    print(proof)
