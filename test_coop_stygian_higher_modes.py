"""Clear Stygian modes in four-party rooms with directional and attack inputs."""
import json

from runtime import ROOT, native
from savegame import validate_save
from test_coop_local import Client, LOCK, SESSIONS, lab
from test_coop_stygian_mode_launches import start_match


STAGED_INPUTS = """
function(C, room, budget)
 local run=room.stygianRun
 local peakStage=run.stage
 local chains,windows={},{}
 local recoveryOnly=run.match~='farka'
 local waitForFinale=run.match=='xbalanque'
 local party=room.members[1].state
 local lastEvent=party.seq
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
    local opening=true
    if recoveryOnly and run.cast then
     local cast=run.cast.child or run.cast
     opening=cast.t>=cast.data.recovery
     if not opening then
      local zones=cast.shapes or cast.areas
      local zone=zones and zones[1]
      if zone and a.x>=zone.left-8 and a.x<=zone.right+8 then
       local left,right=zone.left-24,zone.right+24
       local escape=left>=24 and (right>936 or a.x-left<right-a.x) and left or right
       move=math.max(24,math.min(936,escape))-a.x
      end
     end
    end
    if waitForFinale and run.stage==3 and not run.solo.XB08 and (not run.cast or run.cast.key~='XB08') then
     opening=false
    end
    member.input={left=move<0,right=move>0,jump=jump,
     attack=opening and (run.stage==i or run.stage==3) and not boss.invulnerable
      and math.abs(dx)<=111 and math.abs(dy)<85 and dx*a.dir>=0}
   else member.input=nil end
  end
  C.stepCoop(room,1/60)
  if run.stage>peakStage then peakStage=run.stage end
  if run.cast and run.cast.variant then chains[run.cast.variant]=true end
  if recoveryOnly then
   for index=#party.events,1,-1 do
    local event=party.events[index]
    if event.seq<=lastEvent then break end
    local move=event.kind:match('^stygian:'..run.match..':(%u+%d+):window$')
    if move then
     windows[move]=windows[move] or {}
     table.insert(windows[move],event.tick)
    end
   end
   lastEvent=party.seq
  end
  if run.status~='fighting' then
   for _,member in ipairs(room.members) do member.input=nil end
   local result={ticks=tick,status=run.status,stage=peakStage,remaining=boss.hp}
   if recoveryOnly then result.windows=windows else result.chains=chains end
   return result
  end
 end
 return {ticks=budget,status=run.status,stage=peakStage,chains=chains,remaining=run.boss.hp}
end
"""

BEIDOU_INPUTS = """
function(C, room, budget)
 local run=room.stygianRun
 local boss=run.boss
 local seen={}
 for tick=1,budget do
  for i,member in ipairs(room.members) do
   local s=member.state
   local a=s.actors[s.active]
   if i<=2 and a.hp>0 then
    local dx=boss.x-a.x
    local dir=i==1 and 1 or -1
    local target=math.max(26,math.min(934,boss.x-dir*68))
    local offset=target-a.x
    local move=math.abs(offset)>11 and offset or (dx*a.dir<0 and dx or 0)
    local danger=boss.move
    if danger and a.x>=danger.lo-8 and a.x<=danger.hi+8 then
     local left,right=danger.lo-24,danger.hi+24
     local escape=left>24 and (right>936 or a.x-left<right-a.x) and left or right
     move=math.max(24,math.min(936,escape))-a.x
     if danger.height<=70 and a.ground then C.action(s,'jump') end
    end
    local opening=boss.phase=='recover' or boss.phase=='guard' and i==1
    member.input={left=move<0,right=move>0,attack=opening and math.abs(dx)<=111 and dx*a.dir>=0}
   else member.input=nil end
  end
  C.stepCoop(room,1/60)
  seen[boss.phase]=true
  if boss.move then seen[boss.move.key]=true end
  if run.status~='fighting' then
   for _,member in ipairs(room.members) do member.input=nil end
   return {ticks=tick,status=run.status,seen=seen,remaining=boss.hp}
  end
 end
 return {ticks=budget,status=run.status,seen=seen,remaining=boss.hp}
end
"""


WANDERER_INPUTS = """
function(C,room,budget)
 local run=room.stygianRun
 local boss,arena=run.boss,run.spec.arena
 local proof={stage=1,updrafts=0,landingMarks=0,finalMarks=0}
 local pilot=room.members[1].state
 local lastEvent=pilot.seq
 local function markerInput(a,mark)
  local target,jump=mark.x,false
  if mark.y==290 and a.y>290 then
   local left=a.x<arena.centerX
   if a.ground and a.y==arena.floor then
    target=left and arena.risingPads[1] or arena.risingPads[2]
    jump=math.abs(a.x-target)<10
   elseif a.ground and a.y==372 then
    local takeoff=left and 314 or 646
    if math.abs(a.x-takeoff)<8 then jump=true else target=takeoff end
   end
  elseif mark.y==372 and a.ground and a.y==arena.floor then
   jump=math.abs(a.x-mark.x)<12
  end
  return target,jump
 end
 for tick=1,budget do
  local cast=run.cast
  for index,member in ipairs(room.members) do
   local state=member.state
   local actor=state.actors[state.active]
   local dx,dy=boss.x-actor.x,boss.y-actor.y
   local side=index==1 and 1 or -1
   local target=math.max(25,math.min(935,boss.x-side*61))
   local jump=dy< -68 and math.abs(dx)<145 and actor.ground
   local attack=(run.stage==index or run.stage==3 and run.finaleOpen) and not boss.invulnerable
   if index<=2 and cast and cast.marks then
    local progress=cast.progress[member.id]
    if index==1 and (cast.key=='WD03' and not cast.drop or cast.key=='WD06' and cast.t<cast.data.gateTick) then
     local marker
     for _,mark in ipairs(cast.marks) do
      if not progress.taken[mark.id] then marker=mark;break end
     end
     if marker then target,jump=markerInput(actor,marker) end
     attack=false
    end
    if cast.key=='WD03' and (not cast.drop or cast.t<cast.recover) then attack=false end
    if cast.key=='WD06' and cast.t<cast.recover then
     attack=false
     if progress.gate then target,jump=progress.gate.x,false end
    end
   end
   if index<=2 and actor.hp>0 then
    local offset=target-actor.x
    local move=math.abs(offset)>7 and offset or (attack and dx*actor.dir<0 and dx or 0)
    if jump and actor.ground then C.action(state,'jump') end
    member.input={left=move<0,right=move>0,jump=jump or not actor.ground and actor.vy<0,
     attack=attack and math.abs(dx)<=111 and math.abs(dy)<85 and dx*actor.dir>=0}
   else member.input=nil end
  end
  C.stepCoop(room,1/60)
  proof.stage=math.max(proof.stage,run.stage)
  if cast and cast.marks then
   local progress=cast.progress[room.members[1].id]
   if cast.key=='WD03' then
    proof.landingMarks=math.max(proof.landingMarks,progress.collected)
    if cast.drop then proof.landingY=cast.drop.toY end
   elseif cast.key=='WD06' then
    proof.finalMarks=math.max(proof.finalMarks,progress.collected)
    if progress.gate then proof.finalGate=progress.gate.half end
    proof.finaleOpened=run.finaleOpen
   end
  end
  for index=#pilot.events,1,-1 do
   local event=pilot.events[index]
   if event.seq<=lastEvent then break end
   if event.kind=='stygian:wanderer:updraft' then proof.updrafts=proof.updrafts+1 end
  end
  lastEvent=pilot.seq
  if run.status~='fighting' or tick==budget then
   for _,member in ipairs(room.members) do member.input=nil end
   proof.ticks,proof.status,proof.remaining=tick,run.status,boss.hp
   return proof
  end
 end
end
"""


RERIR_INPUTS = """
function(C,room,budget)
 local run,boss=room.stygianRun,room.stygianRun.boss
 local lamps={}
 local paths={}
 local stage=1
 for tick=1,budget do
  local cast=run.cast
  if cast and run.phase=='fog' and not cast.lamp and cast.t==84 then
   local picker=room.members[run.fog.attempt]
   C.action(picker.state,'encounter_interact')
   if cast.lamp then table.insert(lamps,cast.lamp.owner) end
  end
  for index,member in ipairs(room.members) do
   local state=member.state
   local actor=state.actors[state.active]
   local dx,dy=boss.x-actor.x,boss.y-actor.y
   local side=index==1 and 1 or -1
   local target=math.max(25,math.min(935,boss.x-side*61))
   local jump=dy< -68 and math.abs(dx)<145 and actor.ground
   local attack=not boss.invulnerable and (run.stage==1 or not run.trials[2] or run.trials[2]=='done')
   if cast and cast.path then
    attack=false
    if cast.path==index then
     local progress=cast.pickupsByMember[member]
     local pickups=progress and progress.pickups or cast.pickups
     for _,p in ipairs(pickups) do
      if not p.owner then
       target=p.x
       jump=actor.ground and actor.y>p.sole and math.abs(actor.x-p.x)<90
       break
      end
     end
     if progress then
      local prior=paths[index] or {collected=0}
      paths[index]={collected=math.max(prior.collected,progress.collected),
       protected=prior.protected or progress.protected}
     end
    end
   end
   if index<=2 and actor.hp>0 then
    local offset=target-actor.x
    local move=math.abs(offset)>7 and offset or (attack and dx*actor.dir<0 and dx or 0)
    if jump and actor.ground then C.action(state,'jump') end
    member.input={left=move<0,right=move>0,jump=jump or not actor.ground and actor.vy<0,
     attack=attack and math.abs(dx)<=111 and math.abs(dy)<85 and dx*actor.dir>=0}
   else member.input=nil end
  end
  C.stepCoop(room,1/60)
  stage=math.max(stage,run.stage)
  if run.status~='fighting' or tick==budget then
   for _,member in ipairs(room.members) do member.input=nil end
   return {ticks=tick,status=run.status,stage=stage,remaining=boss.hp,lamps=lamps,
    trials=run.trials,paths=paths,phase=run.phase}
  end
 end
end
"""


RONOVA_INPUTS = """
function(C,room,budget)
 local run,boss=room.stygianRun,room.stygianRun.boss
 local host=room.members[1].state
 local arena=run.spec.arena
 local down,returned=0,0
 local maxStage,road,finalShadows=1,0,0
 local gate,finalVerdict
 local last=host.seq
 for tick=1,budget do
  local cast=run.cast
  for index,member in ipairs(room.members) do
   local state=member.state
   local actor=state.actors[state.active]
   local other=state.actors[3-state.active]
   local dx,dy=boss.x-actor.x,boss.y-actor.y
   local side=index==1 and 1 or -1
   local target=math.max(26,math.min(934,boss.x-side*61))
   local airTarget
   local attack=(run.stage==index or run.stage>=3) and not boss.invulnerable
   if cast and cast.t<cast.recover then attack=false end
   if cast and cast.members then
    local progress=cast.members[member.id]
    if cast.key=='RN03' or cast.key=='RN06' or cast.key=='RN08' then
     for _,shadow in ipairs(progress.shadows) do
      if not shadow.taken and not progress.done then
       target,airTarget=shadow.x,shadow.sole
       break
      end
     end
     if cast.key=='RN08' and progress.gateX and cast.t<cast.recover then
      target,airTarget=progress.gateX,nil
     end
    elseif cast.key=='RN12' and cast.t<cast.recover then
     local point=arena.road[progress.passed+1]
     if point then target,airTarget=point[1],point[2] end
    elseif cast.key=='RN05' and cast.t<cast.recover then
     if index==1 and down==0 then target=cast.mark
     elseif math.abs(actor.x-cast.mark)<90 then
      target=cast.mark<480 and cast.mark+112 or cast.mark-112
     end
    end
    if index==1 then
     if cast.key=='RN12' then road=math.max(road,progress.passed) end
     if cast.key=='RN08' then
      finalShadows=math.max(finalShadows,progress.found)
      if progress.gateX then gate=progress.gateX end
      if progress.verdict then finalVerdict=progress.verdict end
     end
    end
   end
   if index==1 and other.hp<=0 then
    target,airTarget,attack=other.x,nil,false
    if math.abs(actor.x-other.x)<=18 and math.abs(actor.y-other.y)<48 then
     C.action(state,'encounter_interact')
    end
   elseif index==1 and state.active==2 and returned>0 and state.swap<=0 then
    C.action(state,'swap')
   end
   if index<=2 and actor.hp>0 then
    local offset=target-actor.x
    local move=math.abs(offset)>7 and offset or (attack and dx*actor.dir<0 and dx or 0)
    if state.endgameRun.aid then move=0 end
    local jump=airTarget and actor.ground and actor.y>airTarget and math.abs(offset)<85
    if jump then C.action(state,'jump') end
    member.input={left=move<0,right=move>0,jump=jump or not actor.ground and actor.vy<0,
     attack=attack and not state.endgameRun.aid and math.abs(dx)<=111 and math.abs(dy)<85 and dx*actor.dir>=0}
   else member.input=nil end
  end
  C.stepCoop(room,1/60)
  maxStage=math.max(maxStage,run.stage)
  for index=#host.events,1,-1 do
   local event=host.events[index]
   if event.seq<=last then break end
   if event.kind=='stygian:ronova:authority_lethal' then down=down+1 end
   if event.kind=='stygian:ronova:aid-success' then returned=returned+1 end
  end
  last=host.seq
  if run.status~='fighting' or tick==budget then
   for _,member in ipairs(room.members) do member.input=nil end
   return {ticks=tick,status=run.status,stage=maxStage,remaining=boss.hp,down=down,aid=returned,
    road=road,finalShadows=finalShadows,gate=gate,finalVerdict=finalVerdict,phase=run.phase}
  end
 end
end
"""


def recovery_seed(url, seed):
    client = Client(url)
    client.frame(restore=seed)
    client.frame(['story_fast:liyue-harbor'])
    offensive_slots = [item['id'] for item in seed['inventory']['items']
                       if item['owner'] == 1 and item['slot'] in (2, 3, 4, 5)]
    actions = ['weapon_equip:traveler:SW07']
    actions += ['artifact_remove:' + str(item_id) for item_id in offensive_slots]
    frame = client.frame(actions, checkpoint=True)
    assert frame['checkpoint']['weapons']['equipped']['traveler'] == 'SW07'
    assert all(item['owner'] == 0 for item in frame['checkpoint']['inventory']['items']
               if item['id'] in offensive_slots)
    assert 100 <= frame['actors'][0]['atk'] <= 300
    # Each local party needs its own daily profile when a fixture is reused.
    checkpoint = frame['checkpoint']
    checkpoint.pop('daily', None)
    prepared = validate_save(checkpoint)
    client.release()
    return prepared


def check_clears(url, match, inputs, prepare=None, *, normal_only=False):
    matches = json.loads((ROOT / 'content/stygian-matches.json').read_bytes())['matches']
    spec = matches[match]
    graph = json.loads((ROOT / 'content/story-graph.json').read_bytes())
    hub = next(node for node in graph['nodes'] if node['id'] == spec['hub'])
    gate = next(exit for exit in hub['exits'] if exit['to'] == spec['node'])
    seed = validate_save(json.loads((ROOT / 'evidence/remaining-survey-save.json').read_bytes()))
    if prepare:
        seed = prepare(url, seed)
    clients = [Client(url) for _ in range(4)]
    results = []
    for difficulty in spec['modes']:
        mode = difficulty['id']
        if (mode == 'normal') != normal_only:
            continue
        key = f'{match}:{mode}'
        sets = ['troupe', 'gladiator', 'troupe', 'gladiator']
        start_match(clients, seed, match, spec, gate, difficulty, sets)
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
            round_result = native(env['lua'].eval(inputs)(env['core'], room, 10000))
            assert round_result['status'] == 'clear', (key, round_result)
            if match == 'farka':
                assert round_result['stage'] == 3 and round_result['chains'][difficulty['firstChain']]
            if match == 'beidou':
                phases = {'guard', 'baited', 'recover'}
                if difficulty['reprise']:
                    phases.add('wake')
                assert phases <= round_result['seen'].keys(), round_result
            if match == 'capitano':
                windows = round_result['windows']
                assert round_result['stage'] == 3 and {'CP01', 'CP05', 'CP09'} <= windows.keys()
                assert set(windows['CP09']) == {138, 210, 282, 348}, windows
            if match == 'xbalanque':
                windows = round_result['windows']
                assert round_result['stage'] == 3 and {'XB01', 'XB06', 'XB08'} <= windows.keys(), windows
                assert set(windows['XB08']) == {144, 228, 300, 390}, windows
            if match == 'wanderer':
                assert round_result['stage'] == 3 and round_result['updrafts'] > 0, round_result
                assert (round_result['landingMarks'], round_result['landingY']) == (2, 372), round_result
                assert (round_result['finalMarks'], round_result['finalGate']) == (2, 80), round_result
                assert round_result['finaleOpened']
            if match == 'rerir':
                assert round_result['stage'] == 2 and round_result['lamps'] == [1, 2], round_result
                assert round_result['trials'] == ['done', 'done'], round_result
                assert round_result['paths'] == [{'collected': 3, 'protected': True}] * 2, round_result
            if match == 'ronova':
                assert round_result['stage'] == 4 and round_result['road'] == 4, round_result
                assert round_result['down'] > 0 and round_result['aid'] > 0, round_result
                assert round_result['finalShadows'] >= 2 and round_result['finalVerdict'], round_result
            base_reward = [run.rules.xp, run.rules.mora]
            first_bonus = [run.rules.firstXp, run.rules.firstMora]
            contributions = [member.state.endgameRun.skills.normal or 0 for member in room.members.values()]
            assert all(amount>0 for amount in contributions[:2]) and contributions[2:] == [0, 0], contributions
        rewards = []
        for index, client in enumerate(clients):
            clear = client.frame(checkpoint=True)
            assert clear['boss']['hp'] == 0 and clear['endgameRun']['status'] == 'clear'
            save = validate_save(clear['checkpoint'])
            known_items = {item['id'] for item in before[index]['inventory']['items']}
            new_items = [item for item in save['inventory']['items'] if item['id'] not in known_items]
            prior_record = before[index]['endgame']['stygian'].get(key)
            if index < 2:
                reward = clear['endgameRun']['matchReward']
                first = prior_record is None
                expected = [base + (bonus if first else 0) for base, bonus in zip(base_reward, first_bonus)]
                assert reward['first'] is first and [reward['xp'], reward['mora']] == expected
                previous_clears = prior_record['clears'] if prior_record else 0
                assert save['endgame']['stygian'][key]['clears'] == previous_clears + 1
                assert reward['bag'] and len(new_items) == 1 and new_items[0]['setId'] == sets[index]
                rewards.append(reward['set'])
            else:
                assert 'matchReward' not in clear['endgameRun']
                assert save['endgame']['stygian'].get(key) == prior_record
                assert not new_items and save['mora'] == before[index]['mora']
                assert save['progression']['total'] == before[index]['progression']['total']
            assert save['story']['quests'] == seed['story']['quests']
            client.frame(['endgame_exit'])
            client.frame(['coop_leave'])
            restored = client.frame(restore=save, checkpoint=True)['checkpoint']
            assert restored['endgame']['stygian'] == save['endgame']['stygian']
            assert restored['inventory']['items'] == save['inventory']['items']
        assert len(set(rewards)) == 2
        results.append(dict(mode=mode,maxHp=difficulty['hp'],combat=round_result,parties=4,
                            damage=contributions,rewards=rewards,restored=True,inventoryVerified=True,
                            repeatReward=normal_only))
        print(key, round_result['ticks'], contributions, flush=True)
    return results


if __name__ == '__main__':
    import argparse

    parser = argparse.ArgumentParser()
    matches = ('farka', 'beidou', 'capitano', 'xbalanque', 'wanderer', 'rerir', 'ronova')
    parser.add_argument('match', choices=(*matches, 'all'))
    parser.add_argument('--normal', action='store_true', help='Run the seeded normal-mode rematches.')
    options = parser.parse_args()
    selected = matches if options.match == 'all' else (options.match,)
    normal_checks = []
    for match in selected:
        inputs = {'beidou': BEIDOU_INPUTS, 'wanderer': WANDERER_INPUTS,
                  'rerir': RERIR_INPUTS, 'ronova': RONOVA_INPUTS}.get(match, STAGED_INPUTS)
        prepare = recovery_seed if match in ('beidou', 'rerir') else None
        with lab() as url:
            results = check_clears(url, match, inputs, prepare, normal_only=options.normal)
        scope = 'Lv200 reported save; local HTTP room and save restoration, Lua room inputs for battle.'
        if prepare:
            scope += ' SW07 was equipped and four artifact slots were cleared in town to observe mechanics.'
        if options.normal:
            normal_checks.append(dict(match=match, scope=scope, **results[0]))
        else:
            (ROOT / f'evidence/coop-{match}-higher-mode-clears.json').write_text(json.dumps({
                'scope': scope,
                'allyAttackToggleVerified': True,
                'matches': results,
            }, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
    if options.normal:
        suffix = 'all' if options.match == 'all' else options.match
        (ROOT / f'evidence/coop-{suffix}-normal-rematches.json').write_text(json.dumps({
            'matches': normal_checks,
        }, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
