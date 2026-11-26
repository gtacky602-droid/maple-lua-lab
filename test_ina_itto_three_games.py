from copy import deepcopy
import json
import sys
from hashlib import sha256
from test_coop_local import expand_rectangles

from experience import LEVELS, QUEST_REPORT_EXP
from runtime import ROOT, native, runtime
from savegame import validate_save


lua,core=runtime()
quest,town,field="ina-itto-three-games","inazuma-town","ina-festival-games"
advance=lua.eval("function(C,s,n,input) for _=1,n do C.step(s,1/60,input) end end")
graph=json.loads((ROOT/"content/story-graph.json").read_text(encoding="utf8"))
spec=next(node["ittoGames"] for node in graph["nodes"] if node["id"]==field)


def tick(s,n=1,**input):
    advance(core,s,n,lua.table_from(input))


def frame(s):
    return core.frame(s,"sprite","legacy")


def move(s,x,y=480):
    a=s.actors[s.active]
    a.x,a.y,a.vy,a.ground,a.dir=x,y,0,True,1


def gate(s,x,to,allowed=True):
    move(s,x)
    near=frame(s).storyNearbyPortal
    assert near and near.to==to and near.available is allowed,native(near)
    before=s.story.node
    core.action(s,"story_nearby_portal")
    assert s.story.node==(to if allowed else before)


def collect(s,x,y=480):
    move(s,x,y)
    assert frame(s).storyNearbyMilestone
    core.action(s,"story_collect")


def record(s):
    return s.story.quests[quest]


def checkpoint(s):
    return validate_save(native(core.checkpoint(s)))


def load(data):
    return core.restore(lua.table_from(data,recursive=True),12)


def begin(s):
    core.action(s,"story_accept:"+quest)
    gate(s,828,field,False)
    collect(s,681)
    gate(s,828,field)


def start(s,index):
    collect(s,174)
    assert frame(s).storyIttoGames.round==index


def exam(s):
    return (s.kills,s.mora,s.progression.questXp,s.progression.killXp)


def report(s):
    gate(s,56,town)
    before=(s.progression.questXp,s.mora)
    core.action(s,"story_report:"+quest)
    core.action(s,"story_report:"+quest)
    return [s.progression.questXp-before[0],s.mora-before[1]]


def wait_out(s,index):
    tick(s,60*(spec["seconds"][index-1]+1))
    assert not s.ittoRound


s=core.new(12)
core.action(s,"story_start")
core.grantExp(s,LEVELS[39]["maple_reference_total_exp_to_reach"],"quest")
core.enterStoryNode(s,town)
core.action(s,"story_accept:"+quest)
assert not record(s)
s.story.visited["inazuma-port"]=True
for id,count,state in (
    ("inazuma-moving-lantern",6,{"lantern":{"inspected":{"box-leaf":True,"stone-shadow":True,"eaten-nuts":True}}}),
    ("inazuma-torii-maze",5,{"forest":{"looped":True,"defeated":{f"inazuma-thicket-{i}":True for i in range(1,4)}}}),
):
    s.story.quests[id]=lua.table_from(dict(status="complete",count=count,cycles=1,**state),recursive=True)
epilogue = '--epilogue' in sys.argv
earned = epilogue or '--earned' in sys.argv
if earned:
    folder = ROOT/'work/inazuma-fresh-route'
    source = folder/('epilogue-fireworks.json' if epilogue else 'lantern-earned-start.json')
    raw=source.read_bytes()
    s=load(validate_save(json.loads(raw)))
    assert s.story.quests['inazuma-torii-maze'].status=='complete' and not record(s)
    core.action(s,'story_fast:'+town)
    assert s.story.node==town
fixture=checkpoint(s)
packing={}
map_frames={}
game_renderer=lua.execute((ROOT/'story-itto-games.lua').read_text('utf8'))
# Only draw the course with real assets. Keep the live game's canAttack chain intact.
render_context=lua.table_from(dict(drawFieldDisplayArt=core.drawFieldDisplayArt,ittoGameArt=core.ittoGameArt))
draw_course=game_renderer(render_context,None).drawCourse
festival=json.loads((ROOT/'content/worksite-props.json').read_bytes())['festival']
assert festival['node']==field
def check_course(index):
    layers={}
    for mode in ('sprite','rect'):
        draws=lua.table()
        draw_course(lua.table_from(dict(draws=draws)),lua.table_from(spec,recursive=True),
                    s.ittoRound,s.t-s.ittoRound.start,mode,'h32c16')
        layers[mode]=native(draws)
    map_frames[index]=layers
    native_art=native(frame(s).draws)
    marks=festival['stages'][index-1]['course']
    sprites=[d for d in native_art if d.get('source')=='ina-itto-games-props-source-v1.png']
    expected=[]
    for m in marks:
        if m['kind']=='prop':
            expected.append((native(core.ittoGameArt[m['key']].box),m['x'],m['y'],m['height']))
        else:
            assert m in native_art,m
    assert [(d['box'],d['x'],d['y'],d['h']) for d in sprites]==expected
    reference={'draws':native(core.frame(s,'rect','h32c16').draws)}
    s.packRectArt=True
    try:
        f=core.frame(s,'rect','h32c16')
        packet={'draws':native(f.draws),'rectBatches':native(f.rectBatches)}
    finally:
        s.packRectArt=None
    assert list(expand_rectangles(packet))==reference['draws']
    def size(data):
        return len(json.dumps(data,ensure_ascii=False,separators=(',',':')).encode())
    for key in {m['key'] for m in marks if m['kind']=='prop'}:
        runs = native(core.ittoGameArt[key].profiles.h32c16.runs)
        assert packet['rectBatches'].count(runs) == 1, key
    packing[index]=dict(before=size(reference),after=size(packet),objects=len(sprites),batches=len(packet['rectBatches']))
    assert packing[index]['after']<packing[index]['before']
begin(s)
assert not core.canAttack(s)
start(s,1)
check_course(1)
move(s,431)
tick(s)
assert s.ittoRound.player==0
core.action(s,"pause")
remaining=frame(s).storyIttoGames.remaining
tick(s,180)
assert frame(s).storyIttoGames.remaining==remaining
core.action(s,"pause")
for flag in spec["flags"]:
    move(s,flag["x"],flag["y"])
    tick(s)
assert record(s).count==2 and record(s).ittoContest.last[1].player==5
s=load(checkpoint(s))
gate(s,828,field)
assert frame(s).storyIttoGames.next==2

s.actors[2].hp=0
start(s,2)
check_course(2)
assert len(s.enemies)==6 and core.canAttack(s)
assert all(e.noRewards and e.custom for e in s.enemies.values())
before=exam(s)
move(s,310)
core.action(s,"normal")
assert sum(e.hp<=0 for e in s.enemies.values())>=2
tick(s,84,attack=True)
move(s,626,399)
tick(s,135,attack=True)
assert record(s).count==3 and record(s).ittoContest.last[2].player==6
assert exam(s)==before and not len(s.enemies) and not core.canAttack(s)

start(s,3)
check_course(3)
move(s,347)
core.action(s,"story_collect")
assert s.ittoRound.own.points==0
for mark in spec["relay"]["marks"]:
    move(s,mark["x"])
    for _ in range(180):
        if s.ittoRound.own.at:
            break
        tick(s)
    assert frame(s).storyIttoGames.helpReady
    core.action(s,"story_collect")
    tick(s)
    if s.ittoRound:
        assert any(d.text=='旅人「いけー！」' for d in frame(s).draws.values())
assert record(s).count==4 and record(s).ittoContest.best==3
assert frame(s).storyIttoGames.title=="荒瀧三番勝負・全勝"
assert "お前の勝ち" in frame(s).storyNotice
bad=deepcopy(checkpoint(s))
bad["story"]["quests"][quest]["ittoContest"]["last"][1]["player"]=7
try:
    validate_save(bad)
except ValueError as error:
    assert "三番勝負" in str(error)
else:
    raise AssertionError("Invalid round score was accepted")
move(s,spec['prizeX'])
board=frame(s).storyIttoGames.scoreboard
assert board.heading=='前回の三番勝負' and native(board.scores)==native(record(s).ittoContest.last)
reward=report(s)
assert reward==[QUEST_REPORT_EXP["Q-INA-S04"],1550]
first=checkpoint(s)
if epilogue:
    (folder/'epilogue-all.json').write_text(json.dumps(first,ensure_ascii=False),encoding='utf8')
    print('Saved epilogue-all after normal quest report')
    sys.exit(0)
s=load(first)
gate(s,828,field)
assert frame(s).storyIttoGames.title and frame(s).storyIttoGames.next==1
start(s,1)
wait_out(s,1)
assert frame(s).storyIttoGames.next==2 and record(s).ittoContest.series==1
move(s,spec['prizeX'])
board=frame(s).storyIttoGames.scoreboard
assert board.heading=='再戦の途中経過' and len(board.scores)==1
s=load(checkpoint(s))
gate(s,828,field)
move(s,spec['prizeX'])
assert len(frame(s).storyIttoGames.scoreboard.scores)==3
assert frame(s).storyIttoGames.next==1
s.actors[2].hp=0
before=exam(s)
for index in (1,2,3):
    start(s,index)
    if index==3:
        for _ in range(300):
            tick(s)
            if s.ittoRound.other.cheeredAt is not None:
                break
        assert s.ittoRound.other.points==1 and s.ittoRound.own.points==0
        captions={d.text for d in frame(s).draws.values()}
        assert '一斗「いけいけー！」' in captions and '旅人組・応援待ち' in captions
    wait_out(s,index)
assert record(s).ittoContest.series==2 and record(s).ittoContest.best==3
assert all(row.player<row.rival for row in record(s).ittoContest.last.values())
assert exam(s)==before and "俺たちの勝ち" in frame(s).storyNotice
assert report(s)==[0,0]
checkpoint(s)

s=load(fixture)
begin(s)
s.actors[2].hp=0
for index in (1,2,3):
    start(s,index)
    wait_out(s,index)
assert record(s).ittoContest.best==0 and record(s).count==4
assert report(s)==reward

proof={
    "prerequisite":True,"flagHeightAndPause":True,"partialRoundResultsRestore":True,
    "multiTargetNormal":True,"trainingIsRewardless":True,"manualRelaySupport":True,
    "winningAndLosingSameReward":True,"partialReplayDoesNotReplaceRecord":True,
    "replayTitleRemains":True,"forgedScoreRejected":True,"reward":reward,
}
suffix='-earned' if earned else ''
proof.update(packing=packing,mapMatchesRuntime=True,scoreboardAfterRestore=True,bothTeamsCheer=True)
if earned:
    proof.update(startLevel=fixture['progression']['level'],source=source.name,sha256=sha256(raw).hexdigest())
(ROOT/f"evidence/ina-itto-games{suffix}-lua.json").write_text(json.dumps(proof,indent=2)+"\n",encoding="utf8")
(ROOT/"work").mkdir(exist_ok=True)
(ROOT/f"work/ina-itto-games{suffix}-fixture.json").write_text(json.dumps(fixture),encoding="utf8")
(ROOT/f"work/itto-course{suffix}-frames.json").write_text(json.dumps(map_frames,separators=(',',':')),encoding='utf8')
print(proof)
