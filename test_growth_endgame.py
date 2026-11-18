"""Endgame integration through real battles and the four story growth quests."""
from copy import deepcopy
import json

from experience import LEVELS
from runtime import ROOT, native, runtime
from savegame import validate_save

lua, core = runtime()
abyss, stygian, weekly, goal = ('growth-' + name for name in ('abyss', 'stygian', 'weekly', 'next-goal'))
advance = lua.eval('function(C,s,n) for i=1,n do C.step(s,1/60,{}) end end')
run_abyss = lua.eval("""function(C,s,n)
 local rooms={}
 for i=1,n do
  C.step(s,1/60,{})
  local run=s.endgameRun
  if run.status=='between' then rooms[#rooms+1]=run.room;C.action(s,'endgame_next')
  elseif run.status=='clear' or run.status=='failed' then
   if run.status=='clear' then rooms[#rooms+1]=run.room end
   return rooms
  end
 end
 return rooms
end""")


def act(state, action):
    core.action(state, action)


def fresh(level=1):
    s = core.new(12)
    act(s, 'story_start')
    core.grantExp(s, LEVELS[level-1]['maple_reference_total_exp_to_reach'], 'quest')
    return s


def save(state):
    return validate_save(native(core.checkpoint(state)))


def restore(state):
    return core.restore(lua.table_from(save(state), recursive=True))


def write(path, data):
    (ROOT/path).write_text(json.dumps(data, ensure_ascii=False, indent=2)+'\n', encoding='utf8')


def accept(state, quest):
    act(state, 'story_accept:'+quest)
    return state.story.quests[quest]


def report(state, quest):
    act(state, 'story_report:'+quest)
    assert state.story.quests[quest].status=='complete'
    snapshot=save(state)
    act(state, 'story_report:'+quest)
    assert save(state)==snapshot


s=fresh()
assert accept(s, abyss).count==0
assert accept(s, weekly) is None
write('work/growth-endgame-lv1.json', save(s))
act(s, 'abyss_start:entry:troupe')
assert s.endgameRun.room==1 and len(s.enemies)==12 and s.progression.level==1
assert not s.story.active and restore(s).story.node=='mond-town' and restore(s).endgameRun is None
act(s, 'pause')
start=s.t
advance(core,s,120)
assert s.t==start and s.endgameRun.room==1
act(s, 'pause')
act(s, 'auto')
assert list(run_abyss(core,s,10800).values())==[1,2,3]
first=save(s)['endgame']['abyss']['entry']
assert first['bestStars']==3 and s.mora==650 and s.kills==0
assert s.inventory['items'][1].setId=='troupe' and s.inventory['items'][1].itemLv==21
assert s.story.quests[abyss].count==1
act(s, 'endgame_next')
advance(core,s,120)
assert save(s)['endgame']['abyss']['entry']==first and s.mora==650
act(s, 'endgame_exit')
report(s, abyss)

slow=fresh()
assert accept(slow,abyss).count==0
act(slow, 'abyss_start:entry:gladiator')
slow.endgameRun.start=-112
act(slow,'auto')
assert list(run_abyss(core,slow,4078).values())==[1,2,3]
assert slow.endgameRun.stars==1 and slow.story.quests[abyss].count==1
act(slow,'endgame_exit')
act(slow,'abyss_start:elite:troupe')
assert len(slow.enemies)==15 and slow.enemies[1].hp==45
slow.endgameRun.start=slow.t-240
advance(core,slow,1)
assert slow.endgameRun.status=='failed' and save(slow)['endgame']['abyss'].get('elite') is None

elite=fresh(60)
assert core.giveArtifact(elite,2,68,4)
act(elite,'artifact_equip:1')
act(elite,'abyss_start:elite:gladiator')
act(elite,'auto')
assert list(run_abyss(core,elite,14400).values())==[1,2,3]
assert save(elite)['endgame']['abyss']['elite']['clears']==1 and elite.mora==2400
assert elite.story.growth is None or not elite.story.growth['abyss-entry-clear']

full=fresh()
for _ in range(80):
    assert core.giveArtifact(full, 2, 10, 3)
act(full,'abyss_start:entry:troupe')
act(full,'auto')
assert len(run_abyss(core,full,10800))==3
assert len(full.inventory['items'])==80 and len(full.inventory.ground)==1
assert full.inventory.ground[1].item.setId=='troupe' and full.inventory.ground[1].zone=='town'
full=restore(full)
act(full,'artifact_sell:1')
act(full,'artifact_recover')
assert len(full.inventory.ground)==0 and full.inventory['items'][80].setId=='troupe'

f=fresh(30)
assert accept(f,stygian).count==0
act(f,'endgame_farka')
assert f.farka.hp==600 and restore(f).endgameRun is None
lead=f.actors[1]
lead.x,lead.dir=400,1
advance(core,f,225)
assert f.farka.phase=='recover'
lead.x,lead.dir=f.farka.x-40,1
assert core.attack(f,lead,'normal')
advance(core,f,1)
assert 0<f.farka.hp<600 and f.story.quests[stygian].count==1
act(f,'endgame_exit')
report(f,stygian)

w=fresh(30)
core.enterStoryNode(w,'mond-road')
core.enterStoryNode(w,'mond-town')
assert accept(w,weekly).count==0
for key in ['SK09','SK10']:
    assert core.skillDefinitions[key] is not None
assert core.configure(w,lua.table_from([['SK09'],['SK10']]+[[] for _ in range(6)],recursive=True))[0]
write('work/growth-endgame-lv30.json', save(w))
core.enterStoryNode(w,'andrius-wolf-ring')
boss,spec=core.currentWeeklyBoss(w)
lead=w.actors[1]
lead.x,lead.y,lead.dir=boss.primary.x-40,boss.primary.y,1
assert core.attack(w,lead,'normal')
advance(core,w,18)
assert 0<boss.primary.hp<spec.hp and w.story.quests[weekly].count==1
core.enterStoryNode(w,'mond-town')
report(w,weekly)

g=fresh(180)
assert accept(fresh(179),goal) is None
assert accept(g,goal).count==0
assert core.giveArtifact(g,2,40,4,lua.table_from({'setId':'troupe','subpair':'atk_crit'}))
write('work/growth-endgame-lv180.json', save(g))
act(g,'endgame_goal:discover')
act(g,'artifact_equip:1')
assert g.story.quests[goal].count==1
act(g,'endgame_goal:gear')
act(g,'target_set:troupe')
act(g,'artifact_remove:1')
act(g,'artifact_equip:1')
assert g.story.quests[goal].count==2 and save(g)['endgame']['goal']=='gear'
report(g,goal)

discovery=fresh(180)
assert accept(discovery,goal).count==0
act(discovery,'endgame_goal:discover')
core.enterStoryNode(discovery,'dragonspine-camp')
assert discovery.story.quests[goal].count==2

timed=fresh(180)
assert accept(timed,goal).count==0
act(timed,'endgame_goal:boss')
act(timed,'endgame_farka')
lead=timed.actors[1]
lead.x,lead.y,lead.dir,lead.atk=timed.farka.x-60,480,1,9000
assert core.attack(timed,lead,'normal')
advance(core,timed,1)
assert timed.endgameRun.status=='clear' and timed.story.quests[goal].count==2
assert restore(timed).endgame.bosses.farka.clears==1
act(timed,'endgame_exit')
report(timed,goal)
invalid=deepcopy(save(timed))
invalid['endgame']['bosses']['farka']['bestTicks']=0
try:
    validate_save(invalid)
except ValueError:
    pass
else:
    raise AssertionError('zero-tick boss record accepted')

write('evidence/growth-endgame-lua.json', {
 'three_rooms_lv1':True,'entry_best_ticks': first['bestTicks'],'one_star_can_report':True,
 'specified_set_and_full_bag_recovery': True,'elite_clear_and_timeout':True,
 'farka_recovery_hit_before_win': True,'weekly_participation_before_win':True,
 'goal_choices_gear_discovery_boss':True,'save_outside_unfinished_instances':True,
 'one_reward_per_report_and_clear':True
})
print('Endgame Q-G13–16: real rooms, separate boss participation, three goals, one-time reports and saves passed')
