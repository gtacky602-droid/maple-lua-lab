import json

from experience import LEVELS
from runtime import ROOT, native, runtime
from savegame import validate_save


lua, core = runtime()
camp,shelf,shop,shelter,passage,vault=('tunigi-camp','tunigi-vent-shelf','tunigi-baffle-workshop',
    'tunigi-return-shelter','tunigi-elite-passage','tunigi-fragment-vault')
first,second,third='tunigi-vent-record','tunigi-return-design','tunigi-fragment-return'
boss='original-wind-ring'
advance=lua.eval('function(C,s,n) for _=1,n do C.step(s,1/60,{}) end end')


def session(level):
    s=core.new(12)
    core.action(s,'story_start')
    core.grantExp(s,LEVELS[level-1]['maple_reference_total_exp_to_reach'],'quest')
    core.enterStoryNode(s,camp)
    return s


def move(s,x,y=480):
    a=s.actors[s.active]
    a.x,a.y,a.vy,a.ground=x,y,0,True


def frame(s): return core.frame(s,'sprite','legacy')


def gate(s,x,to,y=480,opened=True,lift=False):
    old=s.story.node
    move(s,x,y)
    portal=frame(s).storyNearbyPortal
    assert portal and portal.to==to and portal.available is opened,(old,to,native(portal) if portal else None)
    core.action(s,'story_nearby_portal')
    if lift:
        assert s.lift and s.story.node==old
        advance(core,s,77)
    assert s.story.node==(to if opened else old)
    return portal


def collect(s,q,count,action='story_collect'):
    core.action(s,action)
    assert s.story.quests[q].count==count,(q,s.story.quests[q].count,s.storyNotice)


def checkpoint(s): return validate_save(native(core.checkpoint(s)))
def restore(s): return core.restore(lua.table_from(checkpoint(s),recursive=True),12)


def report(s,q,expected):
    before=s.progression.questXp,s.mora,s.inventory.upgradeOre
    for _ in range(2): core.action(s,'story_report:'+q)
    assert s.story.quests[q].status=='complete'
    assert tuple(a-b for a,b in zip((s.progression.questXp,s.mora,s.inventory.upgradeOre),before))==expected


def defeat(s,e):
    core.resolveCast(s,lua.table_from(dict(id=1,targetId=e.id,x=e.x,y=e.y,atk=450,dir=1,
        radial=True,mult=1,range=60,limit=1,element='physical',gain=0,color='#ffd083',critRate=0)))
    assert e.hp==0


low=session(60)
gate(low,925,shelf,opened=False)
gate(low,1380,'tunigi-depth')
s=session(130)
fixture=checkpoint(s)
gate(s,1095,shop,opened=False)
core.action(s,'story_accept:'+first)
gate(s,925,shelf)
assert len(s.enemies)==3
move(s,449)
assert frame(s).storyAirflow is None
for e in list(s.enemies.values()): defeat(s,e)
assert s.story.quests[first].count==1
tones=[]
for x,y,target,patterns,goal in [(449,480,'○','□○',2),(876,390,'△','○□△',3),(1440,480,'□','□',4)]:
    move(s,x,y)
    assert frame(s).storyAirflow.target==target
    for i,pattern in enumerate(patterns):
        collect(s,first,goal if i==len(patterns)-1 else goal-1)
        cue=frame(s).storyAirflowCue
        assert cue.pattern==pattern
        tones.append((cue.pattern,list(cue.notes.values())))
    advance(core,s,91)
    assert frame(s).storyAirflowCue is None
assert tones==[('□',[220,220]),('○',[392]),('○',[392]),('□',[220,220]),('△',[440,588]),('□',[220,220])]
gate(s,55,camp)
report(s,first,(450000,4800,4))

core.action(s,'story_accept:'+second)
gate(s,1095,shop)
gate(s,1325,shelter,393,opened=False)
move(s,410)
for x in (545,820,1120):
    collect(s,second,0)
    decks=[p for p in s.platforms.values() if p.airflowDeck]
    assert len(decks)==1 and decks[0].x==x and decks[0].preview
    if x!=1120: collect(s,second,0,'story_airflow_commit')
s=restore(s)
gate(s,1095,shop)
assert len(s.platforms)==1
move(s,410)
for _ in range(3): collect(s,second,0)
collect(s,second,1,'story_airflow_commit')
s=restore(s)
gate(s,1095,shop)
assert len(s.platforms)==2 and s.platforms[2].x==1120 and not s.platforms[2].preview
assert not gate(s,1325,shelter,393,opened=False).wind.calm
advance(core,s,145)
gate(s,1325,shelter,393,lift=True)
assert (s.actors[1].x,s.actors[1].y)==(565,387)
gate(s,655,shop,387,opened=False)
move(s,565,387)
collect(s,second,2)
gate(s,655,shop,387,lift=True)
assert (s.actors[1].x,s.actors[1].y)==(1300,393) and not s.platforms[2].preview
advance(core,s,145)
gate(s,1325,shelter,393,lift=True)
move(s,879)
collect(s,second,3)
gate(s,55,camp)
report(s,second,(630000,6200,5))

core.action(s,'story_accept:'+third)
gate(s,1240,shelter)
gate(s,1220,passage)
gate(s,1530,vault,opened=False)
assert sorted(e.y for e in s.enemies.values())==[390,480]
for e in list(s.enemies.values()): defeat(s,e)
gate(s,1530,vault)
move(s,880)
f=frame(s)
assert f.fieldBoss and f.fieldBoss.id==boss
gate(s,1630,shelter,opened=False)
move(s,880)
advance(core,s,120)
assert s.fieldSlots[boss].cast is None and s.actors[1].hp==s.actors[1].maxhp
kill_xp=s.progression.killXp
defeat(s,s.fieldSlots[boss].enemy)
assert s.progression.killXp==kill_xp
assert s.story.quests[third].count==2 and s.fieldSlots[boss].phase=='respawn'
assert '崩れた壁' in gate(s,55,passage,opened=False).reason
gate(s,1630,shelter,opened=False)
move(s,1425)
collect(s,third,3)
gate(s,1630,shelter)
gate(s,55,camp)
move(s,665)
collect(s,third,4)
report(s,third,(364882,461918,6))
s=restore(s)
assert s.story.node==camp and s.story.quests[third].status=='complete'
move(s,665)
assert frame(s).storyNearbyMilestone.label=='展示された記録片を読む'
collect(s,third,4)
assert '東の退路' in s.storyNotice

proof=dict(legacyLv60Access=True,tones=tones,positions=[545,820,1120],previewResetsOnReload=True,
           fixedDeckSurvivesReload=True,
           windBlocksLift=True,returnTrip=True,gateCollapse=True,preparedExit=True,
           bossAppearanceOnly=True,readableAfterRestore=True,firstReport=[364882,461918,6],noSecondPayout=True)
(ROOT/'evidence/tunigi-excavation-lua.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
work=ROOT/'work'
work.mkdir(exist_ok=True)
(work/'tunigi-excavation-fixture.json').write_text(json.dumps(fixture),encoding='utf8')
print(proof)
