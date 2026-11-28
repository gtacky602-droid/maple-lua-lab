from copy import deepcopy
import json

from experience import LEVELS, QUEST_REPORT_EXP
from runtime import ROOT, native, runtime
from savegame import validate_save


lua, core = runtime()
town, port, coast, market, bend, rest = (
    "nod-town", "nod-port", "nod-workshop-coast", "nod-night-stalls", "nod-detour-shore", "nod-far-sea-bench"
)
main, legacy, quest = "nod-first-treasure", "columbina-join", "columbina-coast-detour"
routes = {q["id"]: q for q in json.loads((ROOT/"content/story-graph.json").read_text(encoding="utf8"))["quests"]}
advance = lua.eval("function(C,s,n,input) for _=1,n do C.step(s,1/60,input) end end")
empty = lua.table()
gift_source = "coastal-gifts-source-v1.png"
npc_source = "columbina-idle-source-v3.png"


def frame(s, mode="sprite", profile="legacy"):
    return core.frame(s, mode, profile)


def checkpoint(s):
    return validate_save(native(core.checkpoint(s)))


def restore(s):
    return core.restore(lua.table_from(checkpoint(s), recursive=True), 12)


def move(s, x, y=480):
    actor = s.actors[s.active]
    actor.x, actor.y, actor.vy, actor.ground = x, y, 0, True


def gate(s, x, node, open=True):
    move(s, x)
    origin = s.story.node
    portal = frame(s).storyNearbyPortal
    assert portal and portal.to==node and portal.available==open, (origin,node,native(portal))
    core.action(s,"story_nearby_portal")
    assert s.story.node == (node if open else origin)


def inspect(s,x,y=480):
    move(s,x,y)
    assert frame(s).storyNearbyMilestone
    core.action(s,"story_collect")


def progress(s):
    return s.story.quests[quest]


def strike(s,enemy):
    cast = dict(id=1, targetId=enemy.id, x=enemy.x, y=enemy.y, atk=500,
                dir=1, radial=True, mult=1, range=24, limit=1, element="physical", gain=0,
                color="#f9e6b7", critRate=0)
    core.resolveCast(s,lua.table_from(cast))
    assert not enemy.hp


def start():
    s=core.new(12)
    core.action(s,"story_start")
    core.grantExp(s,LEVELS[119]["maple_reference_total_exp_to_reach"],"quest")
    core.enterStoryNode(s,town)
    return s


fixture = checkpoint(start())
stats = {}
rest_cues = {}
for gift in routes[quest]["itinerary"][1]["choices"]:
    s=start()
    assert not any(q.id==legacy for q in frame(s).storyGraph.quests.values())
    core.action(s,"story_accept:"+main)
    inspect(s,320)
    gate(s,1160,coast)
    assert any(d.source==npc_source for d in frame(s).draws.values())
    core.action(s,"story_accept:"+quest)
    assert progress(s) is None
    inspect(s,540)
    assert s.story.quests[main].count==2
    core.action(s,"story_accept:"+quest)
    assert progress(s).count==0 and not frame(s).storyJoined.columbina
    core.action(s,"story_select_joined:"+quest)
    assert frame(s).companion.id=="amber"
    malformed=deepcopy(checkpoint(s))
    malformed["story"]["quests"][main]["count"]=1
    try:
        validate_save(malformed)
    except ValueError as error:
        assert "初対面" in str(error)
    else:
        raise AssertionError("Detour accepted before meeting")
    gate(s,913,market,False)
    inspect(s,579)
    gate(s,913,market)
    move(s,gift["x"])
    s.camera= max(0,min(gift["x"]-400,s.worldwidth-960))
    assert any(d.source==gift_source for d in frame(s).draws.values())
    gate(s,1370,bend,False)
    inspect(s,gift["x"])
    assert progress(s).storyChoice==gift["id"]
    gate(s,1370,bend)
    gate(s,1447,rest,False)
    defeated=s.enemies[1].spawnId
    strike(s,s.enemies[1])
    s=restore(s)
    assert s.story.node==coast and progress(s).storyChoice==gift["id"]
    gate(s,913,market)
    gate(s,1370,bend)
    assert len(s.enemies)==2 and all(e.spawnId!=defeated for e in s.enemies.values())
    for enemy in list(s.enemies.values()):
        strike(s,enemy)
    gate(s,1447,rest)
    assert len(s.actors)==2 and not len(s.enemies)
    s.actors[1].hp=64
    s.actors[2].hp=97
    move(s,777)
    core.action(s,"jump")
    advance(core,s,60,lua.table_from({"jump":True}))
    assert s.actors[1].ground and s.actors[1].y==386
    s.camera=440
    pose=frame(s)
    assert pose.coastDetourRest.gift==gift["id"] and not pose.coastDetourRest.rested
    assert sum(d.source==npc_source for d in pose.draws.values())==1
    assert sum(d.source==gift_source for d in pose.draws.values())==1
    inspect(s,777,386)
    cue=frame(s).storyResonanceCue
    assert pose.storyResonanceCue is None
    assert cue.pattern=={"biscuit":"焼き菓子を分ける","chime":"海辺の風鈴","tea":"香草茶でひと休み"}[gift["id"]]
    rest_cues[gift["id"]]=dict(label=cue.pattern,notes=list(cue.notes.values()))
    assert frame(s).coastDetourRest.rested and s.storyNotice==routes[quest]["detourLines"][gift["id"]]
    assert all(a.hp==a.maxhp for a in s.actors.values())
    gate(s,1432,coast,False)
    inspect(s,1116,386)
    assert progress(s).count==5
    gate(s,1432,coast)
    xp,mora=s.progression.questXp,s.mora
    for _ in range(2):
        core.action(s,"story_report:"+quest)
    assert progress(s).status=="complete" and frame(s).storyJoined.columbina
    assert (s.progression.questXp-xp,s.mora-mora)==(QUEST_REPORT_EXP["Q-NOD-S01"],3200)
    assert s.story.quests[main].status=="active" and s.story.quests[main].count==2
    core.action(s,"story_select_joined:"+quest)
    f=frame(s)
    assert f.companion.id=="columbina" and f.starterEquipment.weapon.atk==1 and f.starterEquipment.flower.hp==10
    assert f.starterEquipment.useFlower and len(s.actors)==2
    stats[gift["id"]]=(s.actors[2].atk,s.actors[2].maxhp)
    s=restore(s)
    assert frame(s).companion.id=="columbina" and frame(s).starterEquipment is not None
    gate(s,1160,coast)
    gate(s,1122,rest)
    inspect(s,777,386)
    assert frame(s).coastDetourRest.gift==gift["id"] and "寄り道した海" in s.storyNotice
    assert sum(d.source==npc_source for d in frame(s).draws.values())==1
    assert len(s.actors)==2

assert len(set(stats.values()))==1,stats
assert len({tuple(cue["notes"]) for cue in rest_cues.values()})==3
s=start()
core.enterStoryNode(s,port)
core.action(s,"story_accept:"+legacy)
assert s.story.quests[legacy] is None
s.story.visited["nod-field"]=True
s.story.quests[legacy]=lua.table_from(dict(status="active",count=4,cycles=0))
s=restore(s)
assert s.story.quests[legacy].count==4
core.action(s,"story_report:"+legacy)
assert s.story.quests[legacy].status=="complete" and frame(s).storyJoined.columbina
core.action(s,"story_select_joined:"+legacy)
assert frame(s).companion.id=="columbina" and frame(s).starterEquipment is None

proof = dict(offeredAfterFirstMeeting=True, independentOfMainReport=True, noEarlySelection=True,
             threeChoices=list(stats), restCues=rest_cues, identicalStarterStats=list(stats.values())[0],
             partialFightAndGiftRestored=True, safeBenchAndRestCue=True,
             helperIsNotAnExtraPartyActor=True, noDuplicateNpcForCurrentCompanion=True,
             keepsakeAfterReportAndReload=True, oldQuestReportedAndSelected=True, freshLegacyHidden=True,
             reward=[QUEST_REPORT_EXP["Q-NOD-S01"],3200])
(ROOT/"evidence/columbina-detour-lua.json").write_text(json.dumps(proof,indent=2)+"\n",encoding="utf8")
(ROOT/"work/columbina-detour-fixture.json").write_text(json.dumps(fixture),encoding="utf8")
print(proof)
