import json

from experience import CHAPTER_CLEAR_EXP, LEVELS, QUEST_REPORT_EXP
from runtime import ROOT, native, runtime
from savegame import validate_save


lua, core = runtime()
town, mouth, arena, vault = "nod-town", "nod-moon-cave-mouth", "nod-moon-crab-arena", "nod-moon-vault"
first, second, quest = "nod-first-treasure", "nod-moon-crossroads", "nod-moon-vault-quest"
boss = "original-moon-crab"
routes = {q["id"]: q for q in json.loads((ROOT / "content/story-graph.json").read_text(encoding="utf8"))["quests"]}
tick = lua.eval("function(C,s,n,input) for _=1,n do C.step(s,1/60,input) end end")
empty = lua.table()


def step(s, n):
    tick(core, s, n, empty)


def frame(s):
    return core.frame(s, "sprite", "legacy")


def progress(s):
    return s.story.quests[quest]


def slot(s):
    return s.fieldSlots[boss]


def checkpoint(s):
    return validate_save(native(core.checkpoint(s)))


def restore(s):
    return core.restore(lua.table_from(checkpoint(s), recursive=True), 12)


def move(s, x, y=480):
    a = s.actors[s.active]
    a.x, a.y, a.vy, a.ground = x, y, 0, True


def gate(s, x, dest, allowed=True):
    move(s, x)
    origin = s.story.node
    p = frame(s).storyNearbyPortal
    assert p and p.available == allowed and p.to == dest, (origin, dest, native(p))
    core.action(s, "story_nearby_portal")
    assert s.story.node == (dest if allowed else origin)


def inspect(s, x):
    move(s, x)
    assert frame(s).storyNearbyMilestone
    core.action(s, "story_collect")


def strike(s, raw_attack, front=False, element="physical"):
    enemy = slot(s).enemy
    dir = enemy.facing if front else -enemy.facing
    cast = dict(id=1, targetId=enemy.id, x=enemy.x + dir*19, y=enemy.y, atk=raw_attack,
                dir=-dir, radial=True, mult=1, range=70, limit=1, element=element, gain=0,
                color="#f9e6b7", critRate=0)
    hp = enemy.hp
    core.resolveCast(s, lua.table_from(cast))
    return hp - enemy.hp


def wait_move(s, id):
    for _ in range(1400):
        cast = slot(s).cast
        if cast and cast.move.id == id:
            return cast
        step(s, 1)
    raise AssertionError((id, slot(s).phase, s.story.node, slot(s).enemy.hp))


def return_to_arena(s):
    gate(s, 1258, mouth)
    gate(s, 1260, arena)


def prepared():
    s = core.new(12)
    core.action(s, "story_start")
    core.grantExp(s, LEVELS[119]["maple_reference_total_exp_to_reach"], "quest")
    core.enterStoryNode(s, town)
    core.action(s, "story_accept:" + quest)
    assert progress(s) is None
    for i, id in enumerate((first, second)):
        q = routes[id]
        state = dict(status="complete", count=q["goal"], cycles=1)
        if i == 0:
            state["storyChoice"] = "fisher"
        else:
            state["pathProgress"] = {"wood": {"count": 2}, "coast": {"count": 0}}
            for item in q["paths"][0]["steps"]:
                s.story.visited[item["node"]] = True
        for item in q["itinerary"]:
            s.story.visited[item["node"]] = True
        s.story.quests[id] = lua.table_from(state, recursive=True)
    return s


s = prepared()
fixture = checkpoint(s)
core.action(s, "story_accept:" + quest)
gate(s, 1258, mouth)
gate(s, 1260, arena, False)
inspect(s, 1080)
gate(s, 1260, arena)
gate(s, 1731, vault, False)
enemy = slot(s).enemy
assert frame(s).companion.id == "amber"
front = strike(s, 22, front=True)
rear = strike(s, 22)
assert rear > front > 0
assert enemy.x == 950
s.actors[2].hp = 0
move(s, 650)
step(s, 110)
assert enemy.x < 920
move(s, enemy.x - 105)
claw = wait_move(s, "claw")
assert claw.right == claw.origin and claw.left < claw.right
s.actors[1].inv = 0
hp = s.actors[1].hp
step(s, claw.move.windup-1)
assert s.actors[1].hp == hp
step(s, 8)
assert s.actors[1].hp == hp - claw.move.damage
falling = wait_move(s, "box")
fixed = (falling.left, falling.right)
move(s, falling.right+42)
step(s, falling.move.windup+8)
assert (falling.left, falling.right) == fixed and s.actors[1].hp == hp - claw.move.damage
strike(s, 101, element="hydro")
step(s, 1)
assert slot(s).cast.move.id == "shell-break" and slot(s).enemy.cracked
assert slot(s).enemy.hp>0 and slot(s).enemy.hitTop==381
move(s, slot(s).enemy.x-165)
reflection=wait_move(s, "reflection")
fixed=(reflection.left, reflection.right)
move(s, reflection.origin-274)
s.actors[1].inv=0
hp=s.actors[1].hp
step(s, reflection.move.windup+reflection.move.interval)
assert s.actors[1].hp==hp and fixed==(reflection.left,reflection.right)
step(s, reflection.move.interval+4)
assert s.actors[1].hp==hp-reflection.move.damage
held_hp=slot(s).enemy.hp
s=restore(s)
return_to_arena(s)
assert slot(s).enemy.cracked and slot(s).enemy.hp==held_hp and slot(s).cast is None

chapter_before=s.progression.questXp
assert strike(s,600)>0
chapter_xp=CHAPTER_CLEAR_EXP["Q-NOD-M03:BOSS_FIRST"]
assert progress(s).count==2 and s.progression.questXp==chapter_before+chapter_xp
assert frame(s).fieldBoss is None
gate(s,1731,vault)
inspect(s,416)
while len(s.inventory["items"])<80:
    assert core.giveArtifact(s,2,20,3)
ore,mora=s.inventory.upgradeOre,s.mora
inspect(s,657)
assert progress(s).count==3 and progress(s).storyChoice is None and '満杯' in s.storyNotice
assert (s.inventory.upgradeOre,s.mora)==(ore,mora)
gate(s,1430,town)
core.action(s,"artifact_sell:"+str(s.inventory["items"][1].id))
assert len(s.inventory["items"])==79
s=restore(s)
return_to_arena(s)
assert frame(s).fieldBoss is None
gate(s,1731,vault)
ore,mora=s.inventory.upgradeOre,s.mora
choose=657
inspect(s,choose)
assert progress(s).count==4 and progress(s).storyChoice=="feather"
item=s.inventory["items"][80]
assert (item.slot,item.itemLv,item.rarity,item.setId,item.subpair)==(2,140,4,"gladiator","atk_crit")
assert (s.inventory.upgradeOre,s.mora)==(ore+8,mora+14500)
move(s,803)
core.action(s,"story_collect")
assert len(s.inventory["items"])==80 and (s.inventory.upgradeOre,s.mora)==(ore+8,mora+14500)
core.action(s,"story_report:"+quest)
assert progress(s).status=="active"
gate(s,1430,town)
before=s.progression.questXp
for _ in range(2):
    core.action(s,"story_report:"+quest)
report=QUEST_REPORT_EXP["Q-NOD-M03"]
assert progress(s).status=="complete" and s.progression.questXp==before+report
assert (s.inventory.upgradeOre,s.mora)==(ore+8,mora+14500)
s=restore(s)
step(s,3610)
return_to_arena(s)
step(s,1)
assert slot(s).generation>=2 and slot(s).enemy.hp==228 and not slot(s).enemy.cracked
before=(s.progression.questXp,s.inventory.upgradeOre,len(s.inventory["items"]))
assert strike(s,700)>0
assert (s.progression.questXp,s.inventory.upgradeOre,len(s.inventory["items"]))==before
gate(s,1731,vault)
inspect(s,416)
assert s.storyNotice.startswith("探検家の石板")

alternate=prepared()
core.action(alternate,"story_accept:"+quest)
gate(alternate,1258,mouth)
inspect(alternate,1080)
gate(alternate,1260,arena)
strike(alternate,900)
gate(alternate,1731,vault)
inspect(alternate,416)
inspect(alternate,803)
assert progress(alternate).storyChoice=="flower"
item=alternate.inventory["items"][1]
assert (item.slot,item.itemLv,item.rarity,item.setId,item.subpair)==(1,140,4,"troupe","hp_crit")
assert progress(restore(alternate)).storyChoice=="flower"

proof=dict(clawDamage=True, sideHitsStillWork=True, bodyWalks=True, boxLocksPosition=True,
           reflectionDelayedThreeBands=True, crackedHpRestored=True, newMoveAfterShell=True,
           firstChapterXp=chapter_xp, basicAmberParty=True, recoverAfterFullBag=True,
           bothRewardChoices=True, supplies=8, cacheMora=14500, reportXp=report,
           chapterRewardAndChestOnlyOnce=True, repeatableAfterReport=True, tabletReadback=True)
(ROOT/"evidence/nod-moon-vault-lua.json").write_text(json.dumps(proof,indent=2)+"\n",encoding="utf8")
(ROOT/"work/nod-moon-vault-fixture.json").write_text(json.dumps(fixture),encoding="utf8")
print(proof)
