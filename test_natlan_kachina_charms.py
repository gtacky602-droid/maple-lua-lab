from copy import deepcopy
import json

from experience import LEVELS
from runtime import ROOT, native, runtime
from savegame import validate_save


lua, core = runtime()
hub, trail, quest = 'natlan-hub', 'natlan-charm-trail', 'natlan-kachina-charms'
legacy = 'kachina-join'
advance = lua.eval('function(C,s,n,input) for _=1,n do C.step(s,1/60,input) end end')
idle, attack, jump = (lua.table_from(v) for v in ({}, {'attack':True}, {'jump':True}))


def act(key):
    core.action(s,key)


def frame():
    return core.frame(s,'sprite','legacy')


def state():
    return s.story.quests[quest]


def move(x,y=480):
    a=s.actors[s.active]
    a.x,a.y,a.vy,a.ground=x,y,0,True


def collect(x,y=480):
    move(x,y)
    assert frame().storyNearbyMilestone
    act('story_collect')


def gate(x,dest,opens=True):
    previous=s.story.node
    move(x)
    portal=frame().storyNearbyPortal
    if opens:
        assert portal.to==dest and portal.available
    else:
        assert not portal or not portal.available
    act('story_nearby_portal')
    assert s.story.node==(dest if opens else previous)


def save():
    return validate_save(native(core.checkpoint(s)))


def restore(checkpoint):
    return core.restore(lua.table_from(checkpoint,recursive=True),12)


def only_enemy():
    enemies=[e for e in s.enemies.values() if e.hp>0]
    assert len(enemies)==1
    return enemies[0]


def defeat(target,leave_at=None):
    for _ in range(45):
        if target.hp<=0:
            break
        assert target.y==480
        move(target.x-25)
        s.actors[1].dir=1
        advance(core,s,6,attack)
    assert target.hp<=0,(target.hp,s.actors[1].hp)
    if leave_at:
        move(leave_at)


def reject(checkpoint, change):
    data=deepcopy(checkpoint)
    change(data['story']['quests'][quest])
    try:
        validate_save(data)
    except ValueError:
        return
    raise AssertionError('Invalid ornament save was accepted')


s=core.new(12)
act('story_start')
core.grantExp(s,LEVELS[99]['maple_reference_total_exp_to_reach'],'quest')
core.enterStoryNode(s,hub)
fixture=save()
act('story_accept:'+legacy)
assert not s.story.quests[legacy]
act('story_accept:'+quest)
assert state().count==0
gate(668,trail,False)
collect(452)
assert state().count==1
gate(668,trail)
assert len(s.enemies)==0
collect(331)
assert state().count==2 and len(s.enemies)==2 and all(e.y==480 for e in s.enemies.values())
move(730)
s.camera=365
assert any(d.source=='kachina-idle-source-v2.png' and d.y==365 for d in frame().draws.values())
target=s.enemies[1]
defeat(target,555)
partial=save()
assert partial['story']['quests'][quest]['sweep']=={target.spawnId:True}
s=restore(partial)
gate(668,trail)
assert only_enemy().spawnId!=target.spawnId
defeat(only_enemy())
assert state().count==3 and not state().sweep
collect(1116)
assert state().count==4
move(1480)
s.camera=860
jump_cue='ジャンプ長押しで上の足場へ'
assert any(d.text==jump_cue for d in frame().draws.values())
act('story_collect')
assert state().count==4
act('jump')
advance(core,s,56,jump)
assert s.actors[1].y==386 and s.actors[1].ground,(s.actors[1].x,s.actors[1].y,s.actors[1].vy,s.active)
assert not any(d.text==jump_cue for d in frame().draws.values())
act('story_collect')
assert state().count==5
gate(1740,hub)
collect(452)
assert frame().storyStonePair.panel=='craft' and len(frame().storyStonePair['items'])==8
act('story_charm_color:teal')
act('story_charm_pattern:row')
draft=save()
assert draft['story']['quests'][quest]['stonePair']==dict(color='teal',pattern='row')
reject(draft,lambda q:q['stonePair'].update(color='unknown'))
reject(draft,lambda q:q.update(count=4))

choices=[]
for color,pattern in [('amber','fan'),('teal','row'),('purple','fan')]:
    s=restore(draft)
    collect(452)
    assert frame().storyStonePair.color=='teal'
    act('story_charm_color:'+color)
    act('story_charm_pattern:'+pattern)
    preview=native(frame().storyStonePair['items'])
    act('story_charm_confirm')
    assert state().count==6 and not s.stonePairOpen
    assert not core.starterEquipment(s,'kachina')
    exp0,mora0=s.progression.questXp,s.mora
    act('story_report:'+quest)
    act('story_report:'+quest)
    assert (s.progression.questXp-exp0,s.mora-mora0)==(1319124,4800)
    act('story_select_joined:'+quest)
    assert s.companion=='kachina'
    gear=native(core.starterEquipment(s,'kachina'))
    assert gear==dict(weapon=dict(name='山歩きの入門長柄',atk=1),flower=dict(name='山道の石花',hp=10))
    done=save()
    reject(done,lambda q:q.pop('stonePair'))
    s=restore(done)
    collect(452)
    assert frame().storyStonePair.panel=='read'
    assert native(frame().storyStonePair['items'])==preview
    act('story_charm_pattern:row')
    assert frame().storyStonePair.pattern==pattern
    choices.append(dict(color=color,pattern=pattern,xp=1319124,mora=4800,gear=gear))

assert len({(r['color'],r['pattern']) for r in choices})==3
act('story_charm_close')
gate(668,trail)
move(452)
act('story_collect')
assert not s.stonePairOpen and not frame().storyStonePair
old=deepcopy(fixture)
old['story']['visited']['natlan-field']=True
old['story']['quests'][legacy]=dict(status='complete',count=4,cycles=1)
s=restore(validate_save(old))
act('story_select_joined:'+legacy)
assert s.companion=='kachina'
(ROOT/'work/nat-kachina-charms-fixture.json').write_text(json.dumps(fixture,ensure_ascii=False)+'\n',encoding='utf8')
proof=dict(firstMeetingWithoutMainQuest=True,highShelfAndGroundCombat=True,resumesPartialDefeat=True,
           guaranteedThreeMaterials=True,outcropReachedWithHeldJump=True,
           draftAndCompletedDisplaySurviveSave=True,oldCompanionQuestStillLoads=True,
           arrangementsAndEqualReward=choices)
(ROOT/'evidence/nat-kachina-charms-lua.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print('Kachina quest, partial battle, three arrangements, save and first equipment passed')
