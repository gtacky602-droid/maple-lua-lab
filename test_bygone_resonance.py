import json

from experience import LEVELS
from runtime import ROOT, native, runtime
from savegame import validate_save
from tools.ruin_guardian_test import exercise_ruin_guardian


lua,core=runtime()
camp,pier,chamber,hall,gallery,archive=('bygone-camp','bygone-waterway-pier','bygone-resonance-chamber',
    'bygone-inscribed-hall','bygone-listening-gallery','bygone-bell-archive')
first,second,third='bygone-stone-rubbings','bygone-lit-passage','bygone-sound-book'
boss='original-bellgate'
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


def gate(s,x,to,y=480,*,opened=True,waterway=False):
    old=s.story.node
    move(s,x,y)
    portal=frame(s).storyNearbyPortal
    assert portal and portal.to==to and portal.available is opened,(old,to,native(portal) if portal else None)
    core.action(s,'story_nearby_portal')
    if waterway:
        assert frame(s).storyLift.waterway and s.story.node==old
        core.action(s,'pause')
        advance(core,s,120)
        assert s.lift.remaining==1.6 and s.story.node==old
        core.action(s,'pause')
        advance(core,s,97)
        assert s.lift is None
    assert s.story.node==(to if opened else old)


def collect(s,q,count,x,y=480):
    move(s,x,y)
    core.action(s,'story_collect')
    assert s.story.quests[q].count==count,(q,s.story.quests[q].count,s.storyNotice)


def checkpoint(s): return validate_save(native(core.checkpoint(s)))
def restore(s): return core.restore(lua.table_from(checkpoint(s),recursive=True),12)


def report(s,q,expected):
    before=s.progression.questXp,s.mora,s.inventory.upgradeOre
    for _ in range(2): core.action(s,'story_report:'+q)
    assert s.story.quests[q].status=='complete'
    assert tuple(a-b for a,b in zip((s.progression.questXp,s.mora,s.inventory.upgradeOre),before))==expected


low=session(80)
gate(low,831,pier,opened=False)
gate(low,1380,'bygone-depth')
s=session(160)
fixture=checkpoint(s)
gate(s,1152,hall,opened=False)
core.action(s,'story_accept:'+first)
gate(s,831,pier)
gate(s,821,chamber,waterway=True)
assert (s.actors[1].x,s.actors[1].y)==(148,480)
gate(s,56,pier,waterway=True)
assert s.actors[1].x==741
gate(s,821,chamber,waterway=True)
collect(s,first,0,782,388)
collect(s,first,1,317)
assert frame(s).storyResonanceCue.pattern=='◇'
collect(s,first,1,782)
collect(s,first,2,782,388)
assert frame(s).storyResonanceCue is None
assert any(d.text=='裏向き' for d in frame(s).draws.values())
collect(s,first,3,1190)
assert frame(s).storyResonanceCue.pattern=='≈'
collect(s,first,4,1462)
fixed=frame(s).storyResonanceCue
assert fixed.pattern=='✧' and list(fixed.notes.values())==[392,523,587]
assert not any(d.text=='裏向き' for d in frame(s).draws.values())
gate(s,1605,camp)
report(s,first,(810000,8000,5))
gate(s,1005,chamber)
gate(s,1605,camp)

core.action(s,'story_accept:'+second)
gate(s,1152,hall)
move(s,299)
assert list(frame(s).storyResonance.order.values())==['≈','◇','✧']
gate(s,1581,gallery,393,opened=False)
collect(s,second,0,1305)
assert frame(s).storyResonance.progress==1
collect(s,second,0,960,393)
assert frame(s).storyResonance.progress==0 and 'やり直せます' in s.storyNotice
collect(s,second,0,1305)
s=restore(s)
gate(s,1152,hall)
collect(s,second,0,545)
assert frame(s).storyResonance.progress==0
collect(s,second,0,1305)
collect(s,second,0,545)
collect(s,second,0,960)
assert s.resonanceOrder==2
collect(s,second,1,960,393)
assert len(s.platforms)==3 and s.platforms[3].resonanceBridge
s=restore(s)
gate(s,1152,hall)
assert s.story.quests[second].count==1 and s.platforms[3].resonanceBridge
gate(s,1581,gallery,393)
collect(s,second,2,403)
collect(s,second,3,848,391)
gate(s,55,camp)
report(s,second,(1280000,12300,6))
coop_fixture=checkpoint(s)

gate(s,1265,gallery)
gate(s,1390,archive,opened=False)
gate(s,55,camp)
core.action(s,'story_accept:'+third)
gate(s,1265,gallery)
gate(s,1390,archive)
move(s,880)
battle=exercise_ruin_guardian(lua,core,s,boss)
slot=s.fieldSlots[boss]
assert any(d.source=='bellgate-source-v1.png' for d in frame(s).draws.values())
enemy=slot.enemy
xp,mora=s.progression.killXp,s.mora
core.resolveCast(s,lua.table_from(dict(id=1,targetId=enemy.id,x=enemy.x,y=enemy.y,atk=800,dir=1,
    radial=True,mult=1,range=60,limit=1,element='physical',gain=0,color='#ffd083',critRate=0)))
assert slot.phase=='respawn' and s.story.quests[third].count==1 and (s.progression.killXp,s.mora)==(xp,mora)
gate(s,1715,gallery,opened=False)
collect(s,third,1,1402)
collect(s,third,2,1402,386)
gate(s,1715,gallery)
gate(s,55,camp)
collect(s,third,3,689)
report(s,third,(2297237,660060,7))
s=restore(s)
assert s.story.node==camp and s.story.quests[third].status=='complete'
assert s.endgame.bosses[boss].clears==1
move(s,689)
assert frame(s).storyNearbyMilestone.label=='音の絵本を開く'
pages=[]
for index in (1,2,3,1):
    collect(s,third,3,689)
    f=frame(s)
    assert f.storyResonance.page==index
    pages.append((f.storyResonance.pattern,list(f.storyResonanceCue.notes.values())))
assert pages==[('≈',[330,494]),('◇',[294]),('✧',[392,523,587]),('≈',[330,494])]

proof=dict(legacyLv80Access=True,twoWayWaterway=True,pauseHoldsCrossing=True,
    reversedStoneSilent=True,turnedStoneNotes=[392,523,587],wrongOrderClearsOnlyLights=True,
    bridgePersistsAfterLoad=True,recordOnUpperShelf=True,battle=battle,bossClearSaved=True,bookPages=pages,
    firstReport=[2297237,660060,7],oneTimeReport=True)
(ROOT/'evidence/bygone-resonance-lua.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
work=ROOT/'work'
work.mkdir(exist_ok=True)
(work/'bygone-resonance-fixture.json').write_text(json.dumps(fixture),encoding='utf8')
(work/'coop-original-bellgate-fixture.json').write_text(json.dumps(coop_fixture),encoding='utf8')
print(proof)
