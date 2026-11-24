import json

from runtime import ROOT, native, runtime
from savegame import validate_save


lua,core=runtime()
road,coast,island,lookout,grotto,pocket=('mond-road','golden-mainland-coast','golden-hub',
    'golden-shadow-lookouts','golden-shadow-grotto','golden-tide-pocket')
first,second='golden-little-boat','golden-trace-shadows'
advance=lua.eval('function(C,s,n) for _=1,n do C.step(s,1/60,{}) end end')


def frame(s): return core.frame(s,'sprite','legacy')


def move(s,x,y=480):
    a=s.actors[s.active]
    a.x,a.y,a.vy,a.ground=x,y,0,True


def gate(s,x,to,y=480,*,opened=True,boat=False):
    old=s.story.node
    move(s,x,y)
    portal=frame(s).storyNearbyPortal
    assert portal and portal.to==to and portal.available is opened,(old,to,native(portal) if portal else None)
    core.action(s,'story_nearby_portal')
    if boat:
        assert frame(s).storyLift.boat and s.story.node==old
        held=s.lift.remaining
        core.action(s,'pause')
        advance(core,s,140)
        assert s.lift.remaining==held and s.story.node==old
        core.action(s,'pause')
        advance(core,s,127)
        assert s.lift is None
    assert s.story.node==(to if opened else old)


def collect(s,quest,count,x,y=480):
    move(s,x,y)
    core.action(s,'story_collect')
    assert s.story.quests[quest].count==count,(quest,s.story.quests[quest].count)


def checkpoint(s): return validate_save(native(core.checkpoint(s)))
def restore(s): return core.restore(lua.table_from(checkpoint(s),recursive=True),12)


def report(s,quest,expected):
    before=(s.progression.questXp,s.mora,s.inventory.upgradeOre)
    for _ in range(2): core.action(s,'story_report:'+quest)
    assert s.story.quests[quest].status=='complete'
    after=(s.progression.questXp,s.mora,s.inventory.upgradeOre)
    assert tuple(a-b for a,b in zip(after,before))==expected


def defeat(s,enemy):
    core.resolveCast(s,lua.table_from(dict(id=1,targetId=enemy.id,x=enemy.x,y=enemy.y,atk=100,dir=1,
        radial=True,mult=1,range=60,limit=1,element='physical',gain=0,color='#ffd083',critRate=0)))
    assert enemy.hp==0


def published(s):
    return {node.id:node for node in frame(s).storyGraph.nodes.values()}

def atlas(s, destination, *, available=True):
    core.action(s,'world_map_toggle')
    view=frame(s).worldMap
    assert view.region=='hidden-01'
    assert any(point.id==destination for point in view.points.values())==available, destination
    if available:
        core.action(s,'world_map_select:'+destination)
        view=frame(s).worldMap
        assert view.guide and view.guide.status=='ready', destination
        assert view.guide.stops[len(view.guide.stops)].id==destination
    core.action(s,'world_map_close')

def cave_stays_hidden(s):
    move(s,1570)
    f=frame(s)
    assert f.storyNearbyPortal is None
    assert grotto not in {exit.to for exit in published(s)[lookout].exits.values()}
    atlas(s,grotto,available=False)
    atlas(s,pocket,available=False)
    core.action(s,'story_portal:'+grotto)
    assert s.story.node==lookout


s=core.new(12)
core.action(s,'story_start')
gate(s,1380,road)
assert coast not in published(s) and island not in published(s)
core.action(s,'story_discover:golden')
assert not s.story.discovered.golden
move(s,1050)
assert '古い船着き場' in frame(s).storyNearbyMilestone.label
core.action(s,'story_collect')
assert s.story.discovered.golden
assert island not in {exit.to for exit in published(s)[road].exits.values()}
core.action(s,'story_portal:'+island)
assert s.story.node==road
gate(s,1124,coast)
assert s.progression.level==1
gate(s,1530,island,opened=False)
core.action(s,'story_accept:'+first)
collect(s,first,1,345)
assert frame(s).storyRockView.id=='fish-sketch' and frame(s).storyRockView.gap==0
collect(s,first,1,827)
collect(s,first,2,827,390)
gate(s,1530,island,opened=False)
collect(s,first,3,1308)
gate(s,1530,island,boat=True)
assert (s.actors[1].x,s.actors[1].y)==(162,480)
collect(s,first,4,505)
assert frame(s).storyRockView.id=='fish-rock' and frame(s).storyRockView.gap>23
collect(s,first,5,248)
collect(s,first,6,931)
core.action(s,'story_report:'+first)
assert s.story.quests[first].status=='active'
gate(s,248,coast,boat=True)
assert (s.actors[1].x,s.actors[1].y)==(1440,480)
report(s,first,(220,120,1))
s=restore(s)
assert s.story.node==coast and s.story.discovered.golden
core.action(s,'story_fast:'+island)
assert s.story.node==island
core.action(s,'story_accept:golden-explore')
gate(s,1380,'golden-play')
assert s.story.quests['golden-explore'].count==1
gate(s,60,island)

core.action(s,'story_accept:'+second)
gate(s,1222,lookout)
cave_stays_hidden(s)
gaps=[]
for x,y,count in [(405,388,1),(819,480,2),(1290,392,3)]:
    collect(s,second,count,x,y)
    view=frame(s).storyRockView
    gaps.append(round(view.gap,2))
assert gaps[0]==0 and 0<gaps[1]<24 and gaps[2]>=24
collect(s,second,3,405,388)
collect(s,second,3,819)
assert '別の地点' in s.storyNotice
cave_stays_hidden(s)
collect(s,second,4,1290,392)
atlas(s,grotto)
gate(s,1570,grotto)
assert sorted(e.y for e in s.enemies.values())==[391,480,480]
collect(s,second,4,1170)
defeat(s,s.enemies[1])
s=restore(s)
assert s.story.node==island and s.story.quests[second].count==4
gate(s,1222,lookout)
gate(s,1570,grotto)
assert len(s.enemies)==2
for e in list(s.enemies.values()): defeat(s,e)
assert s.story.quests[second].count==5
collect(s,second,6,1170)
atlas(s,pocket,available=False)
assert pocket not in {edge.to for edge in published(s)[grotto].exits.values()}
gate(s,53,lookout)
gate(s,59,island)
collect(s,second,7,1115)
report(s,second,(420,210,2))
s=restore(s)
assert s.story.node==island
atlas(s,pocket)
move(s,1115)
assert frame(s).storyNearbyMilestone.label=='島の記念札を読む'
collect(s,second,7,1115)
assert '岩穴では足元まで通れる道' in s.storyNotice
gate(s,1222,lookout)
gate(s,1570,grotto)
assert len(s.enemies)==0
gate(s,1415,pocket)
assert len(s.enemies)==3
gate(s,61,grotto)
gate(s,53,lookout)
gate(s,59,island)
gate(s,60,road)
gate(s,1050,island)

legacy=core.new(12)
core.action(legacy,'story_start')
gate(legacy,1380,road)
move(legacy,1050)
core.action(legacy,'story_discover:golden')
core.enterStoryNode(legacy,island)
legacy=restore(legacy)
assert not legacy.story.quests[first]
gate(legacy,60,road)
gate(legacy,1050,island)

proof=dict(startsAtLevelOne=True,hiddenUntilDiscovery=True,threeMarks=True,twoWayBoat=True,
    pausesOnBoat=True,threeProjectedGaps=gaps,wrongViewDoesNotUnlock=True,caveGateConcealedUntilChoice=True,
    atlasCaveVisibleAfterPuzzleAndPocketAfterReport=True,
    oldSaveShortcutStillWorks=True,
    groupsResumeAfterSave=True,chestAfterPatrol=True,repeatableCove=True,keepsOldIslandQuest=True,
    mementoReadableAfterSave=True,firstReport=[220,120,1],secondReport=[420,210,2],oneTimePayouts=True)
(ROOT/'evidence/golden-island-route-lua.json').write_text(json.dumps(proof,indent=2)+'\n',encoding='utf8')
print(proof)
