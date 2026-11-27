"""Verify launch, shared boss HP and initiation state across all four-party Stygian modes."""
import json

from runtime import ROOT
from savegame import validate_save
from test_coop_local import Client, LOCK, SESSIONS, lab


def start_match(clients, seed, match, spec, gate, difficulty, sets):
    for client in clients:
        client.frame(restore=seed)
        assert client.frame(['story_fast:' + spec['hub']])['story']['node'] == spec['hub']
        with LOCK:
            actor = SESSIONS[client.sid]['state'].actors[1]
            actor.x, actor.y, actor.vy = gate['x'], gate.get('y', 480), 0
            actor.ground = True
        entered = client.frame(['story_nearby_portal'])
        assert entered['story']['node'] == spec['node'] and entered['coop']['eligible']
    code = clients[0].frame(['coop_create'])['coop']['code']
    for client in clients[1:]:
        assert client.frame(['coop_join:' + code])['coop']['code'] == code
    mode = difficulty['id']
    for client, reward_set in zip(clients, sets, strict=True):
        waiting = client.frame([f'stygian_start:{match}:{mode}:{reward_set}'])
        assert waiting['endgameRun']['gathering'] > 0, (match, mode)
        assert waiting['boss']['maxhp'] == difficulty['hp'], (match, mode)
    return code


def check_modes(url):
    matches = json.loads((ROOT / 'content/stygian-matches.json').read_bytes())['matches']
    graph = json.loads((ROOT / 'content/story-graph.json').read_bytes())
    nodes = {node['id']: node for node in graph['nodes']}
    seed = validate_save(json.loads((ROOT / 'evidence/remaining-survey-save.json').read_bytes()))
    clients = [Client(url) for _ in range(4)]
    host = clients[0]
    results = []

    for match, spec in matches.items():
        gate = next(exit for exit in nodes[spec['hub']]['exits'] if exit['to'] == spec['node'])
        for difficulty in spec['modes']:
            mode = difficulty['id']
            record_key = f'{match}:{mode}'
            start_match(clients, seed, match, spec, gate, difficulty, ['troupe'] * len(clients))

            with LOCK:
                env = SESSIONS[host.sid]
                room = env['state'].coop
                run = room.stygianRun
                same = env['lua'].eval('rawequal')
                assert len(room.members) == len(clients)
                for client in clients:
                    state = SESSIONS[client.sid]['state']
                    assert same(state.endgameRun.shared, run) and same(state.endgameRun.boss, run.boss)
                    assert state.endgameRun.set == 'troupe'
                for _ in range((spec['coop']['gatherSeconds'] + 1) * 60):
                    if run.launched:
                        break
                    env['core'].stepCoop(room, 1 / 60)
                assert run.launched and run.status == 'fighting', record_key
                assert run.boss.hp == run.boss.maxhp == difficulty['hp'], record_key
            for client in clients:
                live = client.frame(checkpoint=True)
                assert live['endgameRun'].get('gathering', 0) == 0 and live['endgameRun']['status'] == 'fighting'
                assert live['boss']['maxhp'] == difficulty['hp']
                assert live['checkpoint']['endgame']['stygian'] == seed['endgame']['stygian']
                client.frame(['endgame_exit'])
                client.frame(['coop_leave'])
            results.append(dict(match=match, mode=mode, parties=4, configuredHp=difficulty['hp'],
                                sharedBoss=True, gatheringCompleted=True, recordsUnchangedAtLaunch=True))
            print(record_key, difficulty['hp'], flush=True)
    return results


if __name__ == '__main__':
    with lab() as url:
        results = check_modes(url)
    (ROOT / 'evidence/coop-stygian-mode-launches.json').write_text(json.dumps({
        'scope': 'Local HTTP join and combat launch. A reported Lv200 save was restored for each party and '
                 'the actors were placed at each gate. Gathering time was advanced inside the Lua room.',
        'matches': len(set(row['match'] for row in results)),
        'difficultyLaunches': len(results),
        'results': results,
    }, indent=2) + '\n', encoding='utf8')
