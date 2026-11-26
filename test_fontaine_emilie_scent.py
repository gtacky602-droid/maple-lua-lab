from copy import deepcopy
import json

from experience import LEVELS, QUEST_REPORT_EXP
from runtime import ROOT, native, runtime
from savegame import validate_save


lua, core = runtime()
hub, atelier, shore = 'fontaine-hub', 'fon-emilie-atelier', 'fon-emilie-scent-shore'
quest = 'fon-emilie-scent'
advance = lua.eval('function(C,s,n,input) for _=1,n do C.step(s,1/60,input) end end')
idle, jump, attack = (lua.table_from(input_) for input_ in ({}, {'jump': True}, {'attack': True}))


def act(key):
    core.action(s,key)


def state():
    return s.story.quests[quest]


def frame():
    return core.frame(s,'sprite','legacy')


def move(x,y=480):
    a=s.actors[s.active]
    a.x,a.y,a.vy,a.ground=x,y,0,True


def gate(x,target,available=True):
    before=s.story.node
    move(x)
    p=frame().storyNearbyPortal
    assert p and p.to==target and p.available is available,native(p)
    act('story_nearby_portal')
    assert s.story.node==(target if available else before)


def collect(x,expected,y=480):
    move(x,y)
    before=state().count
    assert frame().storyNearbyMilestone.label==expected,native(frame().storyNearbyMilestone)
    act('story_collect')
    assert state().count==before+1


def assert_shore_forecast(count):
    act('world_map_focus:'+shore)
    selected=frame().worldMap.selected
    assert selected.id==shore and selected.fieldEnemyCount==1
    assert selected.entryEnemyCount==count and selected.entrySpecies['armored-crab']==count
    act('world_map_close')


def checkpoint():
    return validate_save(native(core.checkpoint(s)))


def restore(data):
    return core.restore(lua.table_from(data,recursive=True),12)


def report(variant,label,x):
    assert state().count==7
    collect(x,label)
    collect(1080,'出来上がった香りを渡す')
    gate(56,hub)
    assert not core.starterEquipment(s,'emilie')
    act('story_select_joined:'+quest)
    assert s.companion=='amber'
    before=(s.progression.questXp,s.mora)
    act('story_report:'+quest)
    act('story_report:'+quest)
    assert state().status=='complete' and state().storyChoice==variant
    act('story_select_joined:'+quest)
    assert s.companion=='emilie' and frame().storyJoined.emilie
    gear=frame().starterEquipment
    assert gear and gear.weapon.atk==1 and gear.flower.hp==10 and gear.useFlower
    assert s.story.quests['fontaine-moon-parcel'] is None
    return [s.progression.questXp-before[0],s.mora-before[1]],native(gear)


def check_bottle(variant,name):
    gate(403,atelier)
    move(607)
    assert frame().storyNearbyMilestone.label=='記念小瓶を読む'
    act('story_collect')
    f=frame()
    assert f.storyEmilieScent.bottle==name
    assert f.storyNotice.startswith('記念小瓶「'+name+'」。')
    assert any(d.source==core.emilieScentArt[variant].source
        and native(d.box)==native(core.emilieScentArt[variant].box) for d in f.draws.values())


s=core.new(12)
act('story_start')
core.enterStoryNode(s,hub)
act('story_accept:'+quest)
assert state() is None
core.grantExp(s,LEVELS[79]['maple_reference_total_exp_to_reach'],'quest')
gate(403,atelier,False)
fixture=checkpoint()
(ROOT/'work/fon-emilie-scent-fixture.json').write_text(json.dumps(fixture,ensure_ascii=False)+'\n',encoding='utf8')
act('story_accept:'+quest)
gate(403,atelier)
gate(1275,shore,False)
collect(456,'エミリエに依頼の話を聞く')
gate(1275,shore)
assert len(s.enemies)==0
assert_shore_forecast(0)
move(1325)
act('story_collect')
assert state().count==1
collect(347,'淡紫の港花を摘む')
move(664)
act('story_collect')
assert state().count==2 and len(s.enemies)==0
act('jump')
advance(core,s,25,jump)
advance(core,s,28,idle)
assert s.actors[s.active].y==394
collect(664,'乾いた香り葉を拾う',394)
assert s.enemies[1].spawnId=='fon-scent-quay-crab'
assert_shore_forecast(1)
before_battle=checkpoint()
s=restore(before_battle)
assert s.story.node==hub
gate(403,atelier)
gate(1275,shore)
e=s.enemies[1]
assert e.spawnId=='fon-scent-quay-crab'
move(e.x-30)
advance(core,s,180,attack)
assert e.hp==0 and state().count==4
assert_shore_forecast(0)
assert not core.starterEquipment(s,'emilie')
collect(1325,'岸に流れ着いた木片を拾う')
gate(1490,atelier)
move(842)
act('story_collect')
assert state().count==5 and state().storyChoice is None
collect(456,'海の気配が強い試作品を試す')
collect(1080,'依頼主に思い出を聞く')
choice_ready=checkpoint()
rewards=[]
gear=[]
for variant,label,name,x in [
    ('amber','木のぬくもりを選ぶ','木のぬくもり',670),
    ('pink','花のやわらかさを選ぶ','花のやわらかさ',842),
    ('mint','窓を開けた朝を選ぶ','窓を開けた朝',1014),
]:
    s=restore(choice_ready)
    gate(403,atelier)
    reward,equipment=report(variant,label,x)
    rewards.append(reward)
    gear.append(equipment)
    signed=checkpoint()
    malformed=deepcopy(signed)
    malformed['story']['quests'][quest]['storyChoice']='trial'
    try:
        validate_save(malformed)
    except ValueError:
        pass
    else:
        raise AssertionError('Invalid perfume selection was accepted')
    s=restore(signed)
    assert s.story.node==hub and s.companion=='emilie'
    check_bottle(variant,name)
    gate(1275,shore)
    assert len(s.enemies)==0

assert rewards==[[QUEST_REPORT_EXP['Q-FON-S01'],2900]]*3
assert gear[0]==gear[1]==gear[2]
proof={'quest':quest,'firstArrival':True,'stagedGatheringAndBattle':True,'resumeBeforeBattle':True,
       'singleReportRewards':rewards,'equalStarterEquipment':gear[0],'threeVialVariantsRestored':True,
       'reportUnlocksCompanion':True,'mainQuestIndependent':True}
(ROOT/'evidence/fon-emilie-scent-lua.json').write_text(json.dumps(proof,indent=2,ensure_ascii=False)+'\n',encoding='utf8')
print(quest,rewards)
