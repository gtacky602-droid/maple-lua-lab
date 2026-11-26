import json
import math

from experience import LEVELS
from runtime import ROOT, native, runtime
from savegame import validate_save


lua,core=runtime()
outer,book,hub,valley,lantern=('fontaine-hub','simulanka-book-room','simulanka-hub',
    'simulanka-fold-valley','simulanka-lantern-perch')
first,second='simulanka-open-page','simulanka-folded-road'
step=lua.eval('function(C,s,n,right,left,jump) for _=1,n do C.step(s,1/60,{right=right,left=left,jump=jump}) end end')


def frame(s): return core.frame(s,'sprite','legacy')


def move(s,x,y=480):
    actor=s.actors[s.active]
    actor.x,actor.y,actor.vy,actor.ground=x,y,0,True


def walk(s,x):
    actor=s.actors[s.active]
    for _ in range(330):
        if abs(actor.x-x)<4: return
        step(core,s,1,actor.x<x,actor.x>x,False)
    raise AssertionError((x,actor.x,actor.y,s.storyNotice))


def jump(s,x,y):
    actor=s.actors[s.active]
    core.action(s,'jump')
    for _ in range(80):
        dx=x-actor.x
        step(core,s,1,dx>4,dx<-4,True)
        if actor.ground and actor.y==y and abs(actor.x-x)<8: return
    raise AssertionError((x,y,actor.x,actor.y,s.storyNotice))


def gate(s,x,dest,y=480,opened=True):
    old=s.story.node
    move(s,x,y)
    portal=frame(s).storyNearbyPortal
    assert portal and portal.to==dest and portal.available is opened,(old,dest,native(portal) if portal else None)
    core.action(s,'story_nearby_portal')
    assert s.story.node==(dest if opened else old)


def collect(s,q,n,x,y=480,key='story_collect'):
    move(s,x,y)
    core.action(s,key)
    assert s.story.quests[q].count==n,(q,n,s.storyNotice)


def checkpoint(s): return validate_save(native(core.checkpoint(s)))
def restore(s): return core.restore(lua.table_from(checkpoint(s),recursive=True),12)


def report(s,q,expected):
    before=(s.progression.questXp,s.mora,s.inventory.upgradeOre)
    for _ in range(2): core.action(s,'story_report:'+q)
    assert s.story.quests[q].status=='complete'
    after=(s.progression.questXp,s.mora,s.inventory.upgradeOre)
    assert tuple(a-b for a,b in zip(after,before))==expected


def exits(s,node):
    return {edge.to for row in frame(s).storyGraph.nodes.values() if row.id==node for edge in row.exits.values()}


s=core.new(12);core.action(s,'story_start')
core.grantExp(s,LEVELS[79]['maple_reference_total_exp_to_reach'],'quest')
core.enterStoryNode(s,outer)
fixture=checkpoint(s)
assert book not in exits(s,outer)
move(s,1050)
core.action(s,'story_collect')
assert book in exits(s,outer) and hub not in exits(s,outer)
gate(s,1138,book)
assert hub not in exits(s,book)
core.action(s,'story_accept:'+first)
collect(s,first,1,321)
(ROOT/'evidence/simulanka-paper-panel-save.json').write_text(json.dumps(checkpoint(s),ensure_ascii=False)+'\n',encoding='utf8')
move(s,497)
assert frame(s).storyPaper.choice=='表・描かれた道'
collect(s,first,1,497,key='story_paper_confirm')
assert 'まだ絵' in s.storyNotice
collect(s,first,1,497)
assert any(p.paperPreview and p.y==389 for p in s.platforms.values())
collect(s,first,1,497)
assert not any(p.paperFold for p in s.platforms.values())
collect(s,first,1,497)
collect(s,first,2,497,key='story_paper_confirm')
s=restore(s)
assert s.story.node==book and any(p.paperFold and not p.paperPreview for p in s.platforms.values())
walk(s,623);jump(s,639,389);walk(s,1350)
core.action(s,'story_nearby_portal')
assert s.story.node==hub
collect(s,first,3,655)
collect(s,first,4,313)
gate(s,313,book)
assert s.actors[1].y==389 and s.actors[1].x==1280
report(s,first,(25500,790,2))
core.action(s,'story_fast:'+hub)
assert s.story.node==hub

core.action(s,'story_accept:'+second)
gate(s,1197,valley)
assert len(s.platforms)==2
collect(s,second,0,235)
assert frame(s).storyPaper.choice=='一枚の長橋'
assert list(frame(s).storyFoldRoute.forms.values())==[1,0,0]
collect(s,second,0,235,key='story_paper_confirm')
assert '低い橋だけ' in s.storyNotice
walk(s,621);jump(s,652,464)
walk(s,1290)
assert s.actors[1].y==464
step(core,s,90,True,False,False)
assert s.actors[1].x<1000 and s.actors[1].hp==s.actors[1].maxhp
s=restore(s)
assert s.story.node==hub
gate(s,1197,valley)
assert len(s.platforms)==2
for x,times in [(235,2),(398,2),(556,3)]:
    for _ in range(times): collect(s,second,0,x)
preview=[p for p in s.platforms.values() if p.paperFold]
assert len(preview)==5 and all(p.paperPreview for p in preview)
collect(s,second,1,556,key='story_paper_confirm')
s=restore(s)
gate(s,1197,valley)
assert all(not p.paperPreview for p in s.platforms.values()) and len(s.platforms)==7
assert len([w for w in s.solids.values() if w.paperFold])==1
s.actors[2].hp=0
walk(s,645)
for x,y in [(680,422),(753,361),(882,310)]: jump(s,x,y)
walk(s,1261);jump(s,1274,281);walk(s,1340)
step(core,s,30,True,False,False)
assert math.isclose(s.actors[1].x,1383)
p=lua.table_from(dict(x=1444,y=257,damage=50))
hp=s.actors[1].hp
assert core.resolveEnemyProjectileSegment(s,p,1360,257,3,12,55) and s.actors[1].hp==hp
jump(s,1500,270);walk(s,1540)
for e in list(s.enemies.values()):
    core.resolveCast(s,lua.table_from(dict(id=1,targetId=e.id,x=e.x,y=e.y,atk=120,dir=1,
        radial=True,mult=1,range=60,limit=1,element='physical',gain=0,color='#ffe0ab',critRate=0)))
assert s.story.quests[second].count==2
gate(s,1860,lantern,270)
assert not any(w.paperFold for w in s.solids.values())
assert any(d.source=='paper-lantern-source-v1.png' for d in frame(s).draws.values())
assert hub not in exits(s,lantern)
collect(s,second,3,507,390)
collect(s,second,3,996,key='story_paper_confirm')
collect(s,second,3,996)
assert frame(s).storyPaper.choice=='折り紙の鳥'
collect(s,second,3,996)
assert frame(s).storyPaper.choice=='折り紙の小舟'
collect(s,second,4,996,key='story_paper_confirm')
assert s.story.quests[second].paperSouvenir=='boat'
gate(s,1280,hub)
collect(s,second,5,905)
report(s,second,(33400,1060,3))
data=checkpoint(s)
for wrong in (None,'flower'):
    q=data['story']['quests'][second]
    q.pop('paperSouvenir',None)
    if wrong: q['paperSouvenir']=wrong
    try:
        validate_save(data)
    except ValueError:
        pass
    else:
        raise AssertionError('accepted invalid souvenir')
s=restore(s)
move(s,905)
assert frame(s).storyNearbyMilestone.label=='置いた折り紙飾りを確かめる'
collect(s,second,5,905)
assert s.storyNotice.startswith('折り紙の小舟')
gate(s,1030,lantern)
gate(s,60,valley)
assert s.actors[1].y==270
s=restore(s)
gate(s,60,outer)
gate(s,1050,hub)
core.action(s,'story_accept:simulanka-explore')
gate(s,1380,'simulanka-play')
assert s.story.quests['simulanka-explore'].count==1

proof=dict(hiddenUntilDiscovery=True,frontBackPreview=True,committedPageRestored=True,safeFall=True,
    incorrectBridgeRejected=True,lockedFoldsSurviveReload=True,ordinaryJumpCrossing=True,
    solidBlocksProjectile=True,guardsAndChest=True,souvenir='boat',souvenirValidation=True,
    souvenirReadback=True,twoWayShortcut=True,oldGateAndQuestKept=True,
    firstReport=[25500,790,2],secondReport=[33400,1060,3],oneTimePayouts=True)
(ROOT/'evidence/simulanka-folds-lua.json').write_text(json.dumps(proof,indent=2)+'\n',encoding='utf8')
work=ROOT/'work';work.mkdir(exist_ok=True)
(work/'simulanka-folds-fixture.json').write_text(json.dumps(fixture),encoding='utf8')
print(proof)
