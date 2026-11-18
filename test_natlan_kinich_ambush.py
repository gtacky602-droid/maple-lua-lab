from copy import deepcopy
import json

from experience import LEVELS, QUEST_REPORT_EXP
from runtime import ROOT, native, runtime
from savegame import validate_save


lua, core = runtime()
hub, trail, field = 'natlan-hub', 'natlan-kinich-hunt', 'natlan-field'
quest, main = 'natlan-kinich-ambush', 'natlan-ridge-flag'
graph = json.loads((ROOT/'content/story-graph.json').read_text(encoding='utf8'))
quests = {q['id']:q for q in graph['quests']}
spec = quests[quest]['kinichHunt']
advance = lua.eval('function(C,s,n,input) for _=1,n do C.step(s,1/60,input) end end')
idle, j, jump = (lua.table_from(data) for data in ({}, {'attack':True}, {'jump':True}))


def act(key):
    core.action(s,key)


def state():
    return s.story.quests[quest]


def frame():
    return core.frame(s,'sprite','legacy')


def move(x,y=480):
    a=s.actors[s.active]
    a.x,a.y,a.vy,a.ground=x,y,0,True


def gate(x,to,opens=True):
    before=s.story.node
    move(x)
    portal=frame().storyNearbyPortal
    assert portal and portal.to==to and portal.available is opens,native(portal)
    act('story_nearby_portal')
    assert s.story.node==(to if opens else before)


def collect(x,text,y=480):
    move(x,y)
    assert frame().storyNearbyMilestone.label==text,native(frame().storyNearbyMilestone)
    act('story_collect')


def save():
    return validate_save(native(core.checkpoint(s)))


def restore(data):
    return core.restore(lua.table_from(data,recursive=True),12)


def wait_phase(phase,limit=1800):
    for _ in range(limit):
        if s.kinichHunt.phase==phase:
            return
        advance(core,s,1,idle)
    raise AssertionError((phase,s.kinichHunt.phase,s.kinichHunt.enemy.x))


def reject(data,change):
    copy=deepcopy(data)
    change(copy['story']['quests'][quest])
    try:
        validate_save(copy)
    except ValueError:
        return
    raise AssertionError('Invalid hunt note passed')


def normal_defeat(enemy):
    for _ in range(300):
        if enemy.hp<=0:
            break
        move(enemy.x-41)
        s.actors[s.active].dir=1
        advance(core,s,5,j)
    assert enemy.hp==0 and state().count==2,(enemy.hp,s.storyNotice)


def report_and_test_shortcut(mode):
    assert state().huntNotes.outcome==mode
    gate(2550,field,False)
    gate(60,hub)
    before=s.progression.questXp,s.mora,s.inventory.upgradeOre
    act('story_report:'+quest)
    act('story_report:'+quest)
    assert spec['reports'][mode] in s.storyNotice
    assert (s.progression.questXp-before[0],s.mora-before[1],s.inventory.upgradeOre-before[2])==(
        QUEST_REPORT_EXP['Q-NAT-S03'],5600,5)
    completed=save()
    reject(completed,lambda q:q['huntNotes'].pop('outcome'))
    reject(completed,lambda q:q['huntNotes'].update(outcome='unknown'))
    gate(405,trail)
    assert len(s.enemies)==0
    gate(2550,field)
    gate(925,trail)
    assert len(s.enemies)==0
    return completed


s=core.new(12)
act('story_start')
core.grantExp(s,LEVELS[99]['maple_reference_total_exp_to_reach'],'quest')
core.enterStoryNode(s,hub)
act('story_accept:'+quest)
assert state() is None
s.story.quests[main]=lua.table_from(dict(status='complete', count=quests[main]['goal'], cycles=1))
for step in quests[main]['itinerary']:
    s.story.visited[step['node']]=True
fixture=save()
act('story_accept:'+quest)
gate(405,trail,False)
collect(392,'キィニチに狩りの話を聞く')
gate(405,trail)
before_clues=save()
enemy=s.kinichHunt.enemy
move(enemy.x-40)
s.actors[1].dir=1
# A build strong enough to finish in one hit still receives the direct outcome.
cast=lua.table_from(dict(id=1,x=enemy.x-40,y=480,range=100,limit=1,dir=1,mult=1,atk=500,
                         color='#ffffff',gain=0,element='physical'))
core.resolveCast(s,cast)
assert enemy.hp==0 and state().count==2
assert native(state().huntNotes)=={'outcome':'direct'}
report_and_test_shortcut('direct')

plans={}
for site in spec['sites']:
    id_=site['id']
    s=restore(before_clues)
    gate(405,trail)
    collect(425,'折れた枝を調べる')
    assert not state().huntNotes.tracks and s.kinichHunt.phase=='scouting'
    collect(314,'足跡を調べる')
    assert s.kinichHunt.phase=='retreat'
    expected=site['label']+'で待ち伏せする'
    if id_=='ledges':
        wait_phase('engaged')
        assert s.kinichHunt.engaged=='direct'
        move(site['x'])
        assert frame().storyNearbyMilestone is None
        act('jump')
        advance(core,s,56,jump)
        assert s.actors[1].y==site['y'] and s.actors[1].ground
        assert frame().storyNearbyMilestone.label==expected
        act('story_collect')
    else:
        collect(site['x'],expected)
    planned=save()
    reject(planned,lambda q:q['huntNotes'].pop('branch'))
    reject(planned,lambda q:q['huntNotes'].update(site='unknown'))
    s=restore(planned)
    gate(405,trail)
    assert state().huntNotes.site==id_ and s.kinichHunt.phase=='retreat'
    wait_phase('turn')
    assert s.kinichHunt.enemy.x==spec['turn']
    wait_phase('engaged')
    enemy=s.kinichHunt.enemy
    assert enemy.x==site['home'] and s.kinichHunt.engaged==id_
    assert enemy.patrolMax-enemy.patrolMin==2*site['span']
    move(enemy.x-42)
    cast=lua.table_from(dict(id=1,x=enemy.x-42,y=480,range=105,limit=1,dir=1,mult=1,atk=2,
                             color='#ffffff',gain=0,root=1.3,pull=35,push=40,element='anemo'))
    home=enemy.x
    core.resolveCast(s,cast)
    assert enemy.hp>0 and enemy.slow==1.3 and (not enemy.root or enemy.root==0) and enemy.x==home
    normal_defeat(enemy)
    complete=report_and_test_shortcut(id_)
    assert restore(complete).story.quests[quest].huntNotes.outcome==id_
    plans[id_]=dict(home=site['home'],span=site['span'],outcome=id_)

(ROOT/'work/nat-kinich-ambush-fixture.json').write_text(json.dumps(fixture,ensure_ascii=False)+'\n',encoding='utf8')
proof=dict(mainPrerequisite=True,oneHitDirect=True,optionalClueOrder=True,latePlanAfterUnassistedReturn=True,
           routes=plans,patrolTurnAndReturn=True,bossControlResistance=True,notesSurviveSave=True,
           reward=[1807313,5600,5],shortcutBothWays=True,noQuestBeastRespawn=True)
(ROOT/'evidence/nat-kinich-ambush-lua.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print('Kinich hunt direct and three ambush routes, patrol, resistance, save, reward and shortcut passed')
