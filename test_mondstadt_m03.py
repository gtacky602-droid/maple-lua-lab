"""Play M03 from an M02 checkpoint at the original combat stats."""
import json

from runtime import ROOT, native, runtime
from savegame import validate_save

lua, core = runtime()
quest = 'mond-watchtower-clear'
s = core.new(12)
core.action(s, 'story_start')
core.action(s, 'story_accept:' + quest)
assert not s.story.quests[quest]
seed = native(core.checkpoint(s))
seed['story']['quests']['amber-join'] = {'status':'complete','count':4,'cycles':1}
seed['story']['quests']['mond-old-trail'] = {
    'status':'complete','count':2,'cycles':1,'inspected':{'wheel-ruts':True}}
validate_save(seed)
(ROOT/'work').mkdir(exist_ok=True)
(ROOT/'work/mondstadt-m03-fixture.json').write_text(json.dumps(seed), encoding='utf8')
s = core.restore(lua.table_from(seed, recursive=True))
core.action(s, 'story_accept:' + quest)
progress = s.story.quests[quest]


def step(**inputs):
    core.step(s, 1/60, lua.table_from(inputs))


def walk(x, attack=False):
    for _ in range(840):
        actor = s.actors[s.active]
        if abs(actor.x-x)<8:
            return
        step(right=actor.x<x,left=actor.x>x,attack=attack)
    raise AssertionError(('cannot walk',s.story.node,x))


def jump(y):
    core.action(s,'jump')
    for _ in range(120):
        step(jump=True)
        actor=s.actors[s.active]
        if actor.ground and actor.y==y:
            return
    raise AssertionError(('cannot jump',s.story.node,y))


def gate(dest):
    portal=core.frame(s).storyNearbyPortal
    assert portal and portal.to==dest and portal.available, native(portal)
    core.action(s,'story_nearby_portal')
    assert s.story.node==dest


walk(1150)
core.action(s,'story_portal:mond-restored-road')
assert s.story.node=='mond-town'
walk(1330)
gate('mond-road')
walk(270)
jump(350)
gate('mond-hill')
walk(1160)
core.action(s,'story_portal:mond-watchtower')
assert s.story.node=='mond-hill'
jump(377)
gate('mond-watchtower')
elite=core.frame(s).storyElite
assert elite.name=='街道の大親分' and elite.maxhp==45
xp_before_victory=s.progression.questXp
walk(455,attack=True)
kills=s.kills
for _ in range(300):
    if s.kills>kills:
        break
    step(attack=True)
assert s.kills>kills and progress.count==0
assert s.progression.questXp==xp_before_victory
walk(780,attack=True)
for _ in range(540):
    if progress.count==1:
        break
    step(attack=True)
assert progress.count==1 and s.returns==0
assert s.progression.questXp==xp_before_victory+5152 and core.frame(s).storyFirstClear.xp==5152
step()
assert len(s.enemies)==0 and core.frame(s).storyCleared and not core.frame(s).storyElite
for _ in range(500):
    step()
assert len(s.enemies)==0

# A checkpoint before reporting still opens the new path after restore.
saved=validate_save(native(core.checkpoint(s)))
resumed=core.restore(lua.table_from(saved,recursive=True))
assert resumed.story.node=='mond-town' and resumed.story.quests[quest].status=='active'
assert resumed.story.quests[quest].count==1
assert resumed.progression.questXp==xp_before_victory+5152 and not core.frame(resumed).storyFirstClear

walk(1650)
gate('mond-restored-road')
assert len(s.enemies)==0
walk(1330)
gate('mond-town')
mora,xp=s.mora,s.progression.questXp
core.action(s,'story_report:'+quest)
core.action(s,'story_report:'+quest)
assert progress.status=='complete' and progress.cycles==1
assert (s.mora,s.progression.questXp)==(mora+220,xp+4771)
saved=validate_save(native(core.checkpoint(s)))
s=core.restore(lua.table_from(saved,recursive=True))
assert s.story.quests[quest].status=='complete'
walk(1150)
gate('mond-restored-road')
walk(106)
gate('mond-watchtower')
assert len(s.enemies)==0 and core.frame(s).storyCleared
walk(104)
gate('mond-hill')
walk(1650)
gate('mond-road')
assert len(s.enemies)>0

checks={'M02_prerequisite':True,'physical_tower_gate':True,'only_named_enemy_counts':True,
        'ordinary_combat':True,'clear_before_report':True,'first_clear_xp':5152,'ready_checkpoint':True,
        'peaceful_shortcut':True,'single_reward':{'xp':4771,'mora':220},
        'completed_checkpoint':True,'persistent_clear_on_reentry':True,'peripheral_field_still_hostile':True}
(ROOT/'evidence/mondstadt-m03-lua.json').write_text(json.dumps(checks,indent=2)+'\n',encoding='utf8')
print('M03 named enemy, cleared tower, restored road, one-time reward and save passed')
