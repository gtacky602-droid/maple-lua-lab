"""Check the castle-town walk, shared roster selection, and old Ayaka quest saves."""
from copy import deepcopy
import json
from runtime import ROOT, native, runtime
from savegame import validate_save

lua, core = runtime()
qid = 'ayaka-join'
main = 'inazuma-moving-lantern'
port, road, town = 'inazuma-port', 'inazuma-road', 'inazuma-town'
s = core.new(12)
core.action(s,'story_start')
core.grantExp(s,sum(core.expNeeded(level) for level in range(1,40)),'quest')
core.enterStoryNode(s,port)
core.action(s,'story_accept:'+qid)
assert not s.story.quests[qid]
core.action(s,'story_accept:'+main)
fixture = native(core.checkpoint(s))
validate_save(fixture)
(ROOT/'work').mkdir(exist_ok=True)
(ROOT/'work/inazuma-s01-fixture.json').write_text(json.dumps(fixture),encoding='utf8')


def restore(data):
    return core.restore(lua.table_from(validate_save(data),recursive=True))


def save():
    return native(core.checkpoint(s))


def step(**keys):
    core.step(s,1/60,lua.table_from(keys))


def walk(x, attack=False):
    for _ in range(900):
        a = s.actors[s.active]
        if abs(a.x-x)<8:
            return
        step(right=a.x<x,left=a.x>x,attack=attack)
    raise AssertionError(('walk',s.story.node,x))


def through(node):
    p = core.frame(s).storyNearbyPortal
    assert p and p.to==node and p.available,native(p)
    core.action(s,'story_nearby_portal')
    assert s.story.node==node


def inspect(label):
    f = core.frame(s)
    assert f.storyNearbySight and label in f.storyNearbySight.label
    core.action(s,'story_collect')


def land(y):
    for _ in range(100):
        step(jump=True)
        a = s.actors[s.active]
        if a.ground and a.y==y:
            return
    raise AssertionError(('ground',y,s.actors[s.active].y))


def unlock():
    core.action(s,'story_accept:'+qid)
    walk(1380)
    through(road)
    walk(1380,attack=True)
    through(town)


s = restore(fixture)
unlock()
q = s.story.quests[qid]
assert q.count==0 and len(s.enemies)==0 and s.companion=='amber'
walk(250)
inspect('桜並木')
core.action(s,'story_collect')
assert q.count==1 and q.sights.seen.sakura
core.action(s,'story_sight_mark:bridge')
assert not q.sights.favorite
s = restore(save())
q = s.story.quests[qid]
assert s.story.node==town and q.count==1
walk(790)
assert not core.frame(s).storyNearbySight
walk(570)
assert not core.frame(s).storyNearbySight
core.action(s,'jump')
land(340)
inspect('高台')
core.action(s,'drop')
land(480)
walk(1090)
inspect('海の坂')
assert q.count==3 and len(s.actors)==2
walk(790)
inspect('橋')
assert len(core.frame(s).storySightChoices)==4
core.action(s,'story_sight_mark:invalid')
assert q.count==3 and not q.sights.favorite
walk(940)
core.action(s,'story_sight_mark:bridge')
assert q.count==3 and not core.frame(s).storySightChoices
walk(790)
core.action(s,'pause')
core.action(s,'story_sight_mark:bridge')
assert q.count==3
core.action(s,'pause')
core.action(s,'story_sight_mark:rooftops')
core.action(s,'story_sight_mark:slope')
assert q.count==4 and q.sights.favorite=='rooftops'
assert core.frame(s).storySightNote.id=='rooftops'
bad = deepcopy(save())
bad['story']['quests'][qid]['sights']['favorite'] = ['bridge']
try:
    validate_save(bad)
except ValueError:
    pass
else:
    raise AssertionError('invalid sight mark was accepted')

walk(110)
through(road)
walk(110,attack=True)
through(port)
xp,mora = s.progression.questXp,s.mora
for _ in range(2):
    core.action(s,'story_report:'+qid)
assert (q.status,q.cycles,s.progression.questXp,s.mora)==('complete',1,xp+2500,mora+200)
assert core.frame(s).storyJoined.ayaka and core.frame(s).storySightNote.name=='屋根越しの高台'
assert s.companion=='amber' and not core.frame(s).starterEquipment
item_count = len(s.inventory['items'])
core.action(s,'story_select_joined:'+qid)
assert s.companion=='ayaka' and (s.actors[2].atk,s.actors[2].maxhp)==(4,150)
assert len(s.inventory['items'])==item_count and core.frame(s).starterEquipment.useFlower
s.actors[2].hp=78
core.action(s,'companion:amber')
assert (s.actors[2].atk,s.actors[2].maxhp,s.actors[2].hp)==(3,140,78)
core.action(s,'story_select_joined:'+qid)
assert s.actors[2].hp==78
core.action(s,'swap')
assert core.giveArtifact(s,1,40,3)
new_item = s.inventory['items'][len(s.inventory['items'])]
core.action(s,'artifact_equip:'+str(new_item.id))
assert not core.frame(s).starterEquipment.useFlower
core.action(s,'artifact_remove:'+str(new_item.id))
assert core.frame(s).starterEquipment.useFlower and s.actors[2].maxhp==150
s = restore(save())
assert s.companion=='ayaka' and core.frame(s).storySightNote.id=='rooftops'
assert core.frame(s).starterEquipment and (s.actors[2].atk,s.actors[2].maxhp)==(4,150)

legacy = deepcopy(fixture)
legacy['story']['quests'][qid]={'status':'active','count':2,'cycles':0}
s = restore(legacy)
q = s.story.quests[qid]
walk(1380)
through(road)
for i in range(1,3):
    core.defeatEnemy(s,s.enemies[i],1)
    step()
assert q.count==4 and not q.sights
walk(110,attack=True)
through(port)
core.action(s,'story_report:'+qid)
s = restore(save())
q = s.story.quests[qid]
assert q.status=='complete' and core.frame(s).storyJoined.ayaka and not core.frame(s).storySightNote

checks = {
    'opens_on_main_quest_accept':True, 'three_sites_and_upper_platform':True,
    'bridge_choice_and_saved_favorite':True, 'no_remote_duplicate_or_paused_choice':True,
    'one_time_report_reward':True, 'legacy_hunt_and_recruitment_saved':True,
    'starter_stats_only_for_ayaka':True, 'equipped_flower_overrides_starter':True,
    'starter_outside_bag_and_restored':True,
}
(ROOT/'evidence/inazuma-s01-lua.json').write_text(json.dumps(checks,indent=2)+'\n',encoding='utf8')
print('Inazuma S01 sights, old hunt, one-time reward and character-bound starter gear passed')
