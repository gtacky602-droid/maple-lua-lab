"""Exercise the routes, guard provenance, difficulty, rewards and Stygian records in Lua."""
from copy import deepcopy
import json

from experience import LEVELS
from runtime import ROOT, native, runtime
from savegame import validate_save

lua,core=runtime()
hub,deck='liyue-harbor','liyue-stygian-deck'
quest='stygian-beidou-commission'
rules=json.loads((ROOT/'content/stygian-matches.json').read_text(encoding='utf8'))['matches']['beidou']
advance=lua.eval('function(C,s,n,input) for i=1,n do C.step(s,1/60,input) end end')


def step(s,n,**inputs):
    advance(core,s,n,lua.table(**inputs))


def at_level(level):
    s=core.new(16)
    core.action(s,'story_start')
    core.grantExp(s,LEVELS[level-1]['maple_reference_total_exp_to_reach'],'quest')
    core.enterStoryNode(s,hub)
    return s


def place(a,x,y=480):
    a.x,a.y,a.vy,a.ground=x,y,0,True


def act(s,key):
    core.action(s,key)


def start(mode='normal',level=30):
    s=at_level(level)
    act(s,'story_accept:'+quest)
    place(s.actors[1],300)
    act(s,'story_nearby_portal')
    assert s.story.node==deck
    act(s,'stygian_start:beidou:'+mode+':troupe')
    run=s.endgameRun
    assert run and run.rules.id==mode and len(s.enemies)==1
    s.actors[2].hp=0
    return s,run,run.boss


def events(s,key):
    return [e for e in s.events.values() if e.kind=='stygian:beidou:'+key]


def until(s,condition,ticks=480):
    for i in range(ticks):
        if condition():
            return
        step(s,1)
    assert condition(),(s.t,s.endgameRun.boss.phase,s.endgameRun.boss.tick)


def cast(s,b,key='normal',power=7,**extra):
    args=dict(id=1,key=key,atk=power,x=b.x-59,y=480,dir=1,range=125,limit=1,mult=1,
              element='physical',color='#fff4d4',gain=0,playerInputAt=s.t,startedAt=s.t)
    args.update(extra)
    return lua.table(**args)


def snapshot(s):
    return validate_save(native(core.checkpoint(s)))


for rule in rules['modes']:
    low=at_level(rule['level']-1)
    act(low,'stygian_start:beidou:'+rule['id']+':troupe')
    assert low.endgameRun is None
    core.enterStoryNode(low,deck)
    act(low,'stygian_start:beidou:'+rule['id']+':troupe')
    assert low.endgameRun is None
    s,run,b=start(rule['id'],rule['level'])
    assert b.hp==rule['hp'] and run.rules.limit==rule['limit']
    assert snapshot(s)['story']['node']==hub
    restored=core.restore(lua.table_from(snapshot(s),recursive=True))
    assert restored.endgameRun is None and restored.story.node==hub

s,run,b=start()
a=s.actors[1]
until(s,lambda:b.phase=='approach')
pre=cast(s,b,key='old')
until(s,lambda:b.phase=='guard')
hp,gauge=b.hp,s.gauge
place(a,b.x-66)
pre.x=b.x-59
core.resolveCast(s,pre)
core.resolveCast(s,cast(s,b,id=2,growthAI=True))
core.resolveCast(s,cast(s,b,reaction=True))
s.auto=True
core.resolveCast(s,cast(s,b))
s.auto=False
assert b.phase=='guard' and not b.guardOwner and b.hp==hp and s.gauge==gauge and not events(s,'baited')
until(s,lambda:b.phase=='tell')
assert b.move.key=='quiet' and len(events(s,'waited'))==1
zone=b.move
place(a,zone.lo-20)
hp=a.hp
until(s,lambda:b.phase=='recover')
assert a.hp==hp and b.span==174 and len(events(s,'recover'))==1
place(a,b.x-67)
a.dir,a.lock,a.cd.normal=1,0,0
assert core.attack(s,a,'normal')
assert b.hp<690 and events(s,'opening-hit')

s,run,b=start('hard',58)
a=s.actors[1]
until(s,lambda:b.phase=='guard')
place(a,b.x-62)
a.dir=1
assert core.attack(s,a,'normal')
assert b.hp==1250 and b.guardOwner==1 and len(events(s,'baited'))==1
step(s,1)
assert b.move.key=='baited' and b.span==41
zone=b.move
place(a,(zone.lo+zone.hi)/2)
hp=a.hp
until(s,lambda:b.phase=='tell' and b.move.key=='wake')
assert len(events(s,'impact:baited'))==1 and a.hp<hp
place(a,b.move.lo-20)
until(s,lambda:b.phase=='recover')
assert b.span==83 and len(events(s,'tell:wake'))==1
assert not snapshot(s).get('endgame',{}).get('stygian')

s,run,b=start('master',103)
a=s.actors[1]
a.inv=9999
until(s,lambda:b.phase=='recover')
core.resolveCast(s,cast(s,b,key='SK01',power=1000))
assert 0<b.hp<b.maxhp*.55
until(s,lambda:b.phase=='feint',2000)
hp=a.hp
step(s,30)
assert b.phase=='feint' and a.hp==hp and len(events(s,'feint'))==1
step(s,1)
assert b.phase=='tell' and b.move.key=='overhead'

s,run,b=start()
a=s.actors[1]
a.inv=100
until(s,lambda:b.phase=='recover')
mora,before=s.mora,len(s.inventory['items'])
core.resolveCast(s,cast(s,b,key='SK03',power=10000))
step(s,1)
assert run.status=='clear' and run.reward.first and s.mora==mora+1210 and len(s.inventory['items'])==before+1
assert s.inventory['items'][before+1].setId=='troupe'
assert s.story.quests[quest].count==1
entry=native(s.endgame.stygian)['beidou:normal']
assert entry['clears']==1 and entry['mainSkill']=='SK03' and entry['companion']=='amber'
step(s,120)
assert s.mora==mora+1210 and len(s.inventory['items'])==before+1
act(s,'endgame_exit')
assert s.story.node==deck and s.endgameRun is None
core.enterStoryNode(s,hub)
act(s,'story_report:'+quest)
assert s.story.quests[quest].status=='complete'
proof=snapshot(s)
restored=core.restore(lua.table_from(proof,recursive=True))
assert restored.story.quests[quest].status=='complete'
assert native(restored.endgame.stygian)['beidou:normal']==entry

invalid=deepcopy(proof)
invalid['endgame']['stygian']['beidou:normal']['bestTicks']=180*60+1
try:
    validate_save(invalid)
except ValueError:
    pass
else:
    raise AssertionError('stygian result past the time limit accepted')

for i in range(len(s.inventory['items'])+1,81):
    assert core.giveArtifact(s,1,30,3)
core.enterStoryNode(s,deck)
act(s,'stygian_start:beidou:normal:gladiator')
run=s.endgameRun
s.actors[2].hp=0
a.inv=100
until(s,lambda:run.boss.phase=='recover')
mora=s.mora
core.resolveCast(s,cast(s,run.boss,key='SK02',power=10000))
step(s,1)
assert run.status=='clear' and not run.reward.first and not run.reward.bag and s.mora==mora+780
assert s.inventory.ground[1].item.setId=='gladiator' and s.inventory.ground[1].zone=='town'
assert s.endgame.stygian['beidou:normal'].clears==2
snapshot(s)

s=at_level(165)
for rank in rules['modes'][1:]:
    core.enterStoryNode(s,deck)
    act(s,'stygian_start:beidou:'+rank['id']+':troupe')
    run=s.endgameRun
    s.actors[2].hp=0
    s.actors[1].inv=100
    until(s,lambda:run.boss.phase=='recover')
    core.resolveCast(s,cast(s,run.boss,power=10000))
    step(s,1)
    assert run.status=='clear' and run.reward.mora==rank['mora']+rank['firstMora']
    assert run.reward.rank==rank['rarity']
    entry=snapshot(s)['endgame']['stygian']['beidou:'+rank['id']]
    assert entry['clears']==1
    act(s,'endgame_exit')

s,run,b=start()
mora=s.mora
run.start=s.t-run.rules.limit
step(s,1)
assert run.status=='failed' and s.mora==mora and not s.endgame
act(s,'endgame_exit')
assert s.story.node==deck and s.endgameRun is None and len(s.enemies)==0

s,run,b=start()
a=s.actors[1]
until(s,lambda:b.phase=='tell')
place(a,b.move.mark)
a.hp,a.inv=1,0
until(s,lambda:run.status=='failed')
assert s.returns==1 and not s.endgame and s.story.node==hub
act(s,'endgame_exit')
assert s.story.node==deck and s.endgameRun is None

s=at_level(38)
s.mora=60000
assert core.giveArtifact(s,2,45,4)
act(s,'artifact_equip:1')
act(s,'artifact_upgrade:1')
assert core.giveArtifact(s,1,50,3)
act(s,'artifact_equip:2')
(ROOT/'work/stygian-beidou-gear.json').write_text(json.dumps(snapshot(s),ensure_ascii=False),encoding='utf8')
results={'difficulty_levels':[r['level'] for r in rules['modes']],'story_route_and_difficulty_gates':True,
         'attempt_loads_at_the_harbor':True,'old_reaction_auto_and_ai_excluded':True,
         'manual_guard_commits_once':True,'withheld_opening_ticks':174,'hard_baited_opening_ticks':83,
         'hard_wake_and_master_feint':True,'dodge_and_actual_health_loss':True,
         'first_reward_all_ranks_and_repeat_overflow':True,'time_and_skill_records':True,'quest_report_save_restore':True,
         'time_limit_and_defeat_no_reward':True}
(ROOT/'evidence/stygian-beidou-lua.json').write_text(json.dumps(results,indent=2)+'\n',encoding='utf8')
print('Beidou Lua: route, movement, four ranks, guard provenance, attacks, defeat, records, rewards and save passed')
