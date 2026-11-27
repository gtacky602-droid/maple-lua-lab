"""Clear all three higher Farka modes in a four-party room with directional/attack inputs."""
import json

from runtime import ROOT, native
from savegame import validate_save
from test_coop_local import Client, LOCK, SESSIONS, lab
from test_coop_stygian_mode_launches import start_match


DRIVE = """
function(C, room, budget)
 local run=room.stygianRun
 local peakStage=run.stage
 local chains={}
 for tick=1,budget do
  local boss=run.boss
  for i, member in ipairs(room.members) do
   local s=member.state
   local a=s.actors[s.active]
   if i<=2 and a.hp>0 then
    local dx,dy=boss.x-a.x,boss.y-a.y
    local dir=i==1 and 1 or -1
    local target=boss.x-dir*64
    local offset=target-a.x
    local move=math.abs(offset)>12 and offset or (dx*a.dir<0 and dx or 0)
    local jump=dy< -68 and math.abs(dx)<145 and a.ground
    member.input={left=move<0,right=move>0,jump=jump,
     attack=(run.stage==i or run.stage==3) and not boss.invulnerable and math.abs(dx)<=111 and math.abs(dy)<85 and dx*a.dir>=0}
   else member.input=nil end
  end
  C.stepCoop(room,1/60)
  if run.stage>peakStage then peakStage=run.stage end
  if run.cast and run.cast.variant then chains[run.cast.variant]=true end
  if run.status~='fighting' then
   for _,member in ipairs(room.members) do member.input=nil end
   return {ticks=tick,status=run.status,stage=peakStage,chains=chains,remaining=boss.hp}
  end
 end
 return {ticks=budget,status=run.status,stage=peakStage,chains=chains,remaining=run.boss.hp}
end
"""


def check_clears(url):
    matches = json.loads((ROOT / 'content/stygian-matches.json').read_bytes())['matches']
    spec = matches['farka']
    graph = json.loads((ROOT / 'content/story-graph.json').read_bytes())
    hub = next(node for node in graph['nodes'] if node['id'] == spec['hub'])
    gate = next(exit for exit in hub['exits'] if exit['to'] == spec['node'])
    seed = validate_save(json.loads((ROOT / 'evidence/remaining-survey-save.json').read_bytes()))
    clients = [Client(url) for _ in range(4)]
    results = []
    for difficulty in spec['modes']:
        mode = difficulty['id']
        if mode == 'normal':
            continue
        key = 'farka:' + mode
        start_match(clients, seed, 'farka', spec, gate, difficulty,
                    ['troupe', 'gladiator', 'troupe', 'gladiator'])
        for client in clients:
            ready = client.frame()
            if ready['active'] != 1:
                ready = client.frame(['swap'])
            if not ready.get('holdAllyFire'):
                ready = client.frame(['hold_ally_fire'])
            assert ready['active'] == 1 and ready['holdAllyFire']
        assert clients[0].frame(['hold_ally_fire'])['holdAllyFire'] is False
        assert clients[0].frame(['hold_ally_fire'])['holdAllyFire'] is True
        before = [client.frame(checkpoint=True)['checkpoint'] for client in clients]
        with LOCK:
            env = SESSIONS[clients[0].sid]
            room = env['state'].coop
            run = room.stygianRun
            round_result = native(env['lua'].eval(DRIVE)(env['core'], room, 10000))
            assert round_result['status'] == 'clear', (key, round_result)
            assert round_result['stage'] == 3 and round_result['chains'][difficulty['firstChain']]
            expected = [run.rules.xp + run.rules.firstXp, run.rules.mora + run.rules.firstMora]
            contributions = [member.state.endgameRun.skills.normal or 0 for member in room.members.values()]
            assert all(amount>0 for amount in contributions[:2]) and contributions[2:] == [0, 0], contributions
        rewards = []
        for index, client in enumerate(clients):
            clear = client.frame(checkpoint=True)
            assert clear['boss']['hp'] == 0 and clear['endgameRun']['status'] == 'clear'
            save = validate_save(clear['checkpoint'])
            if index < 2:
                reward = clear['endgameRun']['matchReward']
                assert reward['first'] and [reward['xp'], reward['mora']] == expected
                assert save['endgame']['stygian'][key]['clears'] == 1
                rewards.append(reward['set'])
            else:
                assert 'matchReward' not in clear['endgameRun'] and key not in save['endgame']['stygian']
                assert save['mora'] == before[index]['mora']
            assert save['story']['quests'] == seed['story']['quests']
            client.frame(['endgame_exit'])
            client.frame(['coop_leave'])
            restored = client.frame(restore=save, checkpoint=True)['checkpoint']
            assert restored['endgame']['stygian'] == save['endgame']['stygian']
        assert len(set(rewards)) == 2
        results.append(dict(mode=mode,maxHp=difficulty['hp'],combat=round_result,parties=4,
                            damage=contributions,rewards=rewards,restored=True))
        print(key, round_result['ticks'], contributions, flush=True)
    return results


if __name__ == '__main__':
    with lab() as url:
        results = check_clears(url)
    (ROOT / 'evidence/coop-farka-higher-mode-clears.json').write_text(json.dumps({
        'scope': 'Lv200 reported save; local HTTP room and save restoration, Lua room inputs for battle.',
        'allyAttackToggleVerified': True,
        'matches': results,
    }, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
