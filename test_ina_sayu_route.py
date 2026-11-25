from copy import deepcopy
import json
import sys
from hashlib import sha256

from experience import LEVELS, QUEST_REPORT_EXP
from runtime import ROOT, native, runtime
from savegame import validate_save
from test_coop_local import expand_rectangles


lua, core = runtime()
quest, town, path = "ina-sayu-quiet-route", "inazuma-town", "ina-sayu-watchpath"
advance = lua.eval("function(C,s,n,input) for _=1,n do C.step(s,1/60,input) end end")


def tick(s, n=1, **input):
    advance(core, s, n, lua.table_from(input))


def frame(s):
    return core.frame(s,"sprite","legacy")


def move(s,x,y=480):
    a=s.actors[s.active]
    a.x,a.y,a.ground,a.vy,a.dir=x,y,True,0,1
    s.camera=max(0,min(x-400,s.worldwidth-960))


def gate(s,x,to,allowed=True):
    move(s,x)
    portal=frame(s).storyNearbyPortal
    assert portal and portal.to==to and portal.available is allowed,native(portal)
    before=s.story.node
    core.action(s,"story_nearby_portal")
    assert s.story.node==(to if allowed else before)


def collect(s,x,y=480):
    move(s,x,y)
    assert frame(s).storyNearbyMilestone
    core.action(s,"story_collect")


def state(s):
    return s.story.quests[quest]


def save(s):
    return validate_save(native(core.checkpoint(s)))


def restore(data):
    return core.restore(lua.table_from(data,recursive=True),12)


def measure_packing(s,profile):
    reference={'draws':native(core.frame(s,"rect",profile).draws)}
    s.packRectArt=True
    try:
        frame=core.frame(s,"rect",profile)
        packet={'draws':native(frame.draws),'rectBatches':native(frame.rectBatches)}
    finally:
        s.packRectArt=None
    assert list(expand_rectangles(packet))==reference['draws']
    def size(value):
        return len(json.dumps(value,ensure_ascii=False,separators=(',',':')).encode())
    before,after=size(reference),size(packet)
    assert after<before
    return dict(before=before,after=after,rectangles=len(reference['draws']),batches=len(packet['rectBatches']),profile=profile)


def begin(s):
    core.action(s,"story_accept:"+quest)
    gate(s,454,path,False)
    collect(s,346)
    gate(s,454,path)
    assert state(s).count==1 and not len(s.enemies)


s=core.new(12)
core.action(s,"story_start")
core.grantExp(s,LEVELS[39]["maple_reference_total_exp_to_reach"],"quest")
core.enterStoryNode(s,town)
core.action(s,"story_accept:"+quest)
assert not state(s)
s.story.quests["inazuma-moving-lantern"]=lua.table_from({
    "status":"complete","count":6,"cycles":1,
    "lantern":{"inspected":{"box-leaf":True,"stone-shadow":True,"eaten-nuts":True}},
},recursive=True)
s.story.visited["inazuma-port"]=True
earned = '--earned' in sys.argv
if earned:
    source = ROOT / 'work/inazuma-fresh-route/forest-earned-start.json'
    raw = source.read_bytes()
    s = restore(validate_save(json.loads(raw)))
    assert s.story.quests["inazuma-moving-lantern"].status == "complete" and not state(s)
    core.action(s,"story_fast:"+town)
    assert s.story.node == town
fixture=save(s)
initial_kills=s.kills
begin(s)
move(s,540)
for _ in range(300):
    tick(s)
    if 15<=frame(s).storyStealth.heat<=35: break
else:
    raise AssertionError("Patrol failed to build attention")
move(s,472)
tick(s,45)
assert frame(s).storyStealth.mode=="cover" and frame(s).storyStealth.heat==0
assert not state(s).stealthEncounter
# Close enough to reach the mark, but just outside the right edge of the grass.
move(s,504)
assert not frame(s).storyNearbyMilestone
core.action(s,"story_collect")
assert state(s).count==1
move(s,472)
packing={'brush':measure_packing(s,'h32c16')}
collect(s,472)
move(s,1012)
core.action(s,"story_collect")
assert state(s).count==2
core.action(s,"jump")
tick(s,55,jump=True)
assert s.actors[1].ground and s.actors[1].y==392
assert frame(s).storyStealth.mode=="cover"
packing['cave']=measure_packing(s,'h48c32')
collect(s,1012,392)
move(s,1589)
packing['tree']=measure_packing(s,'legacy')
collect(s,1589)
assert state(s).count==4 and s.kills==initial_kills
gate(s,2188,town,False)
move(s,2029)
core.action(s,"dodge")
assert s.actors[1].x<=2046
tick(s,60,right=True)
assert s.actors[1].x<=2046
collect(s,1943)
assert frame(s).storyStealth.mode=="hatch"
tick(s,20)
core.action(s,"pause")
tick(s,190)
assert state(s).count==4
core.action(s,"pause")
tick(s,47,right=True)
packing['liftingGate']=measure_packing(s,'h32c16')
gate_art=core.stealthArt.gate
gate_draw=next(d for d in frame(s).draws.values()
               if d.source==gate_art.source and d.box[1]==gate_art.box[1] and d.box[2]==gate_art.box[2])
assert gate_draw.y<480 and state(s).count==4 and s.actors[1].x==1943
tick(s,23,right=True)
assert state(s).count==5 and frame(s).storyStealth.mode=="open"
gate(s,2188,town)
assert s.actors[1].x==1172
collect(s,1135)
before=(s.progression.questXp,s.mora)
core.action(s,"story_report:"+quest)
core.action(s,"story_report:"+quest)
reward=[s.progression.questXp-before[0],s.mora-before[1]]
assert reward==[QUEST_REPORT_EXP["Q-INA-S03"],1050]
s=restore(save(s))
move(s,1135)
assert 'もう一度' in frame(s).storyNearbyMilestone.label
packing['nap']=measure_packing(s,'h32c16')
balance=(s.progression.questXp,s.mora)
core.action(s,"story_collect")
assert 'ありがとう' in s.storyNotice and (s.progression.questXp,s.mora)==balance
gate(s,1148,path)
assert s.actors[1].x==2150 and not len(s.enemies) and frame(s).storyStealth.mode=="open"

# The combat encounter persists independently of which marker was already visited.
s=restore(fixture)
begin(s)
move(s,550)
for _ in range(420):
    tick(s)
    if state(s).stealthEncounter=="engaged": break
assert state(s).count==1 and state(s).stealthEncounter=="engaged"
assert len(s.enemies)==1 and s.enemies[1].spawnId=="sayu-watch-brush"
move(s,472)
assert not frame(s).storyNearbyMilestone
core.action(s,"story_collect")
assert state(s).count==1
stored=save(s)
bad=deepcopy(stored)
bad["story"]["quests"][quest]["stealthEncounter"]="unknown"
try:
    validate_save(bad)
except ValueError as error:
    assert "見回り役" in str(error)
else:
    raise AssertionError("Invalid encounter was accepted")
s=restore(stored)
gate(s,454,path)
assert state(s).stealthEncounter=="engaged" and len(s.enemies)==1
core.defeatEnemy(s,s.enemies[1],1)
assert state(s).stealthEncounter=="cleared"
s=restore(save(s))
gate(s,454,path)
assert not len(s.enemies) and frame(s).storyStealth.mode=="cleared"
collect(s,472)
assert state(s).count==2 and not state(s).stealthEncounter
collect(s,1012,392)
collect(s,1589)
collect(s,1943)
tick(s,100)
assert state(s).count==5

result={
    "prerequisite":True,"coverCoolsAttention":True,"quietRouteWithoutKills":True,
    "heightMatters":True,"detectedCanContinue":True,"engagedAndClearedRestore":True,
    "invalidAlertRejected":True,"fenceAndPause":True,"animatedGateLift":True,"shortcutRoundTrip":True,
    "singleReportReward":True,"reward":reward,"coverEdgeBlocked":True,"rereadGift":True,"packing":packing,
}
suffix="-earned" if earned else ""
if earned:
    result.update(startLevel=fixture['progression']['level'],source=source.name,sha256=sha256(raw).hexdigest())
(ROOT/f"evidence/ina-sayu-route{suffix}-lua.json").write_text(json.dumps(result,indent=2)+"\n",encoding="utf8")
(ROOT/"work").mkdir(exist_ok=True)
(ROOT/f"work/ina-sayu-route{suffix}-fixture.json").write_text(json.dumps(fixture),encoding="utf8")
print(result)
