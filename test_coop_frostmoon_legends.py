"""Exercise the individual surveys and console trials before the Frostmoon co-op fights."""
import json
import subprocess
import sys

from runtime import ROOT, runtime
from test_coop_branch_legends import SPECS, actor_at, hit, level, read
from test_coop_dorn_sky_legends import create_room
from test_coop_late_branch_bosses import difference, report_rewards
from test_coop_local import LOCK, SESSIONS, lab
from test_coop_natlan_atocpan_totem import cross_route
from test_coop_natlan_entry_legends import shared_attacks
from test_coop_natlan_final_legends import encounter
from test_coop_natlan_north_trials import collect
from test_coop_nod_first_field_legends import go, locked_gate
from test_coop_ruin_guardians import QUESTS, balances
from test_coop_snez_first_field_legends import enter_bout


HUB = 'frostmoon-camp'
PRISM, MUSHT = 'legend-frostmoon_prism_slime', 'legend-frostmoon_mushteshir'
ACCESS, CONSOLE = 'frost-wujian-access-survey', 'frost-commander-console-test'
TRAIL, = SPECS[PRISM]['entryThrough']
HALL, = SPECS[MUSHT]['entryThrough']
COAST = ('nod-wp-92871', 'nod-wp-92872', 'nod-wp-99218', 'nod-wp-99223', 'nod-wp-99219', HUB)
LOWLAND = (HUB, 'frost-wp-99282', 'frost-wp-99284')
SOUTH = (*LOWLAND, 'frost-wp-99287', TRAIL)
NORTH = (*LOWLAND, 'frost-wp-99285', 'frost-wp-99289', 'frost-wp-99290', 'frost-wp-99305', 'frost-wp-99306', HALL)
ACCESS_STEPS = QUESTS[ACCESS]['itinerary']
TRIAL_STEPS = QUESTS[CONSOLE]['itinerary']
FIRST, SECOND = (TRIAL_STEPS[i]['node'] for i in (1, 3))


def inspect(client, quest, steps, index):
    return collect(client, steps[index])['story']['quests'][quest]['count']


def report(client, quest):
    with LOCK:
        state = SESSIONS[client.sid]['state']
        before = balances(state)
    for _ in range(2):
        result = client.frame(['story_report:' + quest], checkpoint=True)
    with LOCK:
        assert difference(balances(state), before) == report_rewards(QUESTS[quest])
    assert result['story']['quests'][quest]['status'] == 'complete'
    return result['checkpoint']


def wave_enemies(client):
    with LOCK:
        return {e.spawnId: e for e in SESSIONS[client.sid]['state'].enemies.values() if e.hp > 0}


def fight_wave(client, index):
    with LOCK:
        env = SESSIONS[client.sid]
        state = env['state']
        enemies = wave_enemies(client)
        assert set(enemies) == set(TRIAL_STEPS[index]['enemies'])
        for offset, enemy in enumerate(enemies.values()):
            assert enemy.hp == enemy.maxhp
            actor_at(state, enemy.x)
            hit(env['lua'], env['core'], state, enemy, 10000)
            assert state.story.quests[CONSOLE].count == index + offset


def frostmoon(url):
    host, guest, code = create_room(url, COAST[0], PRISM)
    pairs = ((host, guest), (guest, host))
    for client, peer in pairs:
        go(client, peer, COAST, code)
        client.frame(['story_accept:' + ACCESS])
        assert inspect(client, ACCESS, ACCESS_STEPS, 0) == 1
        go(client, peer, (*LOWLAND, ACCESS_STEPS[1]['node']), code)
        assert inspect(client, ACCESS, ACCESS_STEPS, 1) == 2
        go(client, peer, tuple(reversed((*LOWLAND, ACCESS_STEPS[1]['node']))), code)
    report(host, ACCESS)
    for client, peer in pairs:
        go(client, peer, SOUTH, code)
    basin = SPECS[PRISM]['node']
    cross_route(host, (TRAIL, basin), code)
    with LOCK:
        env = SESSIONS[guest.sid]
        level(env['core'], env['state'], 188)
    denied = locked_gate(guest, TRAIL, basin, '報告')
    assert denied['story']['quests'][ACCESS]['count'] == 2 and denied['coop']['peers'][0]['map'] == basin
    go(guest, host, tuple(reversed(SOUTH)), code)
    report(guest, ACCESS)
    go(guest, host, SOUTH, code)
    cross_route(host, (basin, TRAIL), code)
    prism = encounter(host, guest, PRISM, TRAIL, code)

    for client, peer in pairs:
        go(client, peer, tuple(reversed(SOUTH)), code)
        client.frame(['story_accept:' + CONSOLE])
        go(client, peer, NORTH, code)
        assert inspect(client, CONSOLE, TRIAL_STEPS, 0) == 1
        enter_bout(client, HALL, FIRST, code)
    fight_wave(host, 1)
    assert set(wave_enemies(guest)) == set(TRIAL_STEPS[1]['enemies'])
    assert guest.frame()['story']['quests'][CONSOLE]['count'] == 1
    fight_wave(guest, 1)
    for client, _ in pairs:
        cross_route(client, (FIRST, HALL), code)
    checkpoint = guest.frame(checkpoint=True)['checkpoint']
    resume = guest.frame(restore=checkpoint)
    assert resume['story']['node'] == HUB and resume['story']['quests'][CONSOLE]['count'] == 2
    assert guest.frame(['coop_join:' + code])['coop']['code'] == code
    go(guest, host, NORTH, code)
    locked_gate(guest, HALL, SECOND, 'もう一度')
    enter_bout(guest, HALL, FIRST, code)
    assert not wave_enemies(guest)
    cross_route(guest, (FIRST, HALL), code)
    for client, _ in pairs:
        assert inspect(client, CONSOLE, TRIAL_STEPS, 2) == 3
        enter_bout(client, HALL, SECOND, code)
    chamber = SPECS[MUSHT]['node']
    fight_wave(host, 3)
    cross_route(host, (SECOND, HALL), code)
    assert inspect(host, CONSOLE, TRIAL_STEPS, 4) == 5
    with LOCK:
        env = SESSIONS[host.sid]
        level(env['core'], env['state'], 190)
    cross_route(host, (HALL, chamber), code)
    assert set(wave_enemies(guest)) == set(TRIAL_STEPS[3]['enemies'])
    fight_wave(guest, 3)
    cross_route(guest, (SECOND, HALL), code)
    locked_gate(guest, HALL, chamber, '190')
    with LOCK:
        env = SESSIONS[guest.sid]
        level(env['core'], env['state'], 190)
    denied = locked_gate(guest, HALL, chamber, '装置')
    assert denied['story']['quests'][CONSOLE]['count'] == 4 and denied['coop']['peers'][0]['map'] == chamber
    assert inspect(guest, CONSOLE, TRIAL_STEPS, 4) == 5
    cross_route(host, (chamber, HALL), code)
    musht = encounter(host, guest, MUSHT, HALL, code)

    for client, peer in pairs:
        enter_bout(client, HALL, SECOND, code)
        assert not wave_enemies(client)
        cross_route(client, (SECOND, HALL), code)
        go(client, peer, (HALL, NORTH[-2]), code)
        assert client.frame()['actors'][0]['y'] == 390
        go(client, peer, tuple(reversed(NORTH[:-1])), code)
        saved = report(client, CONSOLE)
        assert all(saved['endgame']['bosses'][id]['clears'] == 1 for id in (PRISM, MUSHT))
        restored = client.frame(restore=saved)
        assert all(restored['story']['quests'][q]['status'] == 'complete' for q in (ACCESS, CONSOLE))
    return dict(prism=prism, musht=musht, sharedCoastalRoute=True, individualSurveyReport=True, independentChamberLevel=True,
                personalConsoleWaves=True, firstWaveSavedAndRestored=True, clearedWavesStayEmpty=True,
                consolePassageReturnY=390, bothReportsAndClearsRestored=True)


if __name__ == '__main__':
    subprocess.run([sys.executable, '-X', 'utf8', str(ROOT / 'test_final_field_legends.py')], check=True)
    coverage = read('content/coverage.json')
    preview = coverage['multiplayer_preview']
    roster = set(coverage['optional_legend_coverage']['stage_by_legend'])
    assert roster <= set(preview['bosses'])
    assert all(SPECS[id]['coop'] and SPECS[id]['node'] in preview['maps'] for id in roster)
    lua, core = runtime()
    proof = {'sharedLocalLegendBindings': len(roster),
             'lua': {id: shared_attacks(lua, core, id) for id in (PRISM, MUSHT)}}
    with lab() as url:
        proof['http'] = frostmoon(url)
    (ROOT / 'evidence/coop-frostmoon-legends-lua-http.json').write_text(
        json.dumps(proof, indent=2) + '\n', encoding='utf8')
    print(proof)
