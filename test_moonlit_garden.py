from argparse import ArgumentParser
import json
from pathlib import Path

from experience import LEVELS
from runtime import ROOT, native, runtime
from savegame import validate_save
from tools.original_boss_lifecycle import check_original_boss_retry


parser = ArgumentParser(description='Play the Moonlit Garden route and report the fixed sword reward.')
parser.add_argument('--earned-save', type=Path, help='Continue a route checkpoint at Lv195 or higher')
parser.add_argument('--draft-balance', action='store_true')
options, _ = parser.parse_known_args()
comparison = options.earned_save is not None or options.draft_balance
lua, core = runtime(draft_balance=options.draft_balance)
field, camp, town = 'nod-field', 'nod-special-camp', 'nod-town'
water, garden, rim = 'nod-reflector-shore', 'nod-reflection-garden', 'nod-quiet-rim'
first, second, third = 'nod-light-path', 'nod-light-record', 'nod-rim-return'
boss = 'original-prism-walker'
rotate, toggle, confirm = 'story_collect', 'story_reflection_light', 'story_reflection_confirm'
batch = lua.eval('function(C,s,n) for _=1,n do C.step(s,1/60,{}) end end')


def move(s, x, y=480):
    a = s.actors[s.active]
    a.x, a.y, a.vy, a.ground = x, y, 0, True


def gate(s, x, destination, *, y=480, opened=True):
    move(s,x,y)
    portal = core.frame(s,'sprite','legacy').storyNearbyPortal
    assert portal.to == destination and portal.available is opened, (s.story.node,destination,portal.reason)
    core.action(s,'story_nearby_portal')
    if opened:
        assert s.story.node == destination


def count(s, q, n):
    assert s.story.quests[q].count == n, (q,s.story.quests[q].count,n,s.storyNotice)


def checkpoint(s):
    return validate_save(native(core.checkpoint(s)))


def restore(s):
    return core.restore(lua.table_from(checkpoint(s),recursive=True),12)


def hit(s, x, strength=100):
    core.resolveCast(s,lua.table_from(dict(id=1,x=x,y=480,atk=strength,dir=1,
        radial=True,mult=1,range=85,limit=1,element='physical',gain=0,color='#ffd083',critRate=0)))


def report(s, q, expected):
    before = s.progression.questXp,s.mora
    for _ in range(2):
        core.action(s,'story_report:'+q)
    assert s.story.quests[q].status == 'complete'
    assert (s.progression.questXp-before[0],s.mora-before[1]) == expected


if options.earned_save is not None:
    data = validate_save(json.loads(options.earned_save.read_text(encoding='utf8')))
    assert data['progression']['level'] >= 195
    s = core.restore(lua.table_from(data, recursive=True), 12)
    core.action(s,'story_fast:'+town)
    assert s.story.node == town
    fixture = checkpoint(s)
    gate(s,60,field)
else:
    s = core.new(12)
    core.action(s,'story_start')
    core.grantExp(s, LEVELS[194]['maple_reference_total_exp_to_reach'], 'quest')
    core.enterStoryNode(s,'nod-port')
    fixture = checkpoint(s)
    gate(s,1380,field)
gate(s,720,camp)
core.action(s,'story_accept:'+second)
assert s.story.quests[second] is None
core.action(s,'story_accept:'+first)
gate(s,1020,water)
gate(s,1580,garden,y=390,opened=False)
move(s,759,390)
core.action(s,rotate)
count(s,first,0)
for x,y,turns,progress in [(323,480,2,1),(759,390,3,2),(1220,480,1,3)]:
    move(s,x,y)
    for i in range(turns):
        core.action(s,rotate)
        count(s,first,progress if i==turns-1 else progress-1)
assert len(s.platforms) == 3
s = restore(s)
assert s.story.node == camp
count(s,first,3)
gate(s,1020,water)
bridges = [p for p in s.platforms.values() if (p.x,p.y,p.w)==(1370,390,290)]
assert len(bridges) == 1
gate(s,1580,garden,y=390)
move(s,322)
core.action(s,rotate)
count(s,first,4)
gate(s,55,water)
gate(s,55,camp)
report(s,first,(15000000,6400))

core.action(s,'story_accept:'+second)
gate(s,1020,water)
gate(s,1580,garden,y=390)
move(s,568)
core.action(s,rotate)
core.action(s,confirm)
count(s,second,0)
core.action(s,toggle)
frame = core.frame(s,'sprite','legacy')
assert frame.storyReflection.image == '四角' and not frame.storyReflection.lit
core.action(s,toggle)
assert core.frame(s,'sprite','legacy').storyReflection.image == '三角'
core.action(s,confirm)
count(s,second,0)
for turns,progress in [(2,1),(1,2),(2,3)]:
    for _ in range(turns):
        core.action(s,rotate)
    core.action(s,toggle)
    core.action(s,confirm)
    count(s,second,progress-1)
    core.action(s,toggle)
    core.action(s,confirm)
    count(s,second,progress)
move(s,1320)
core.action(s,rotate)
gate(s,1640,rim,opened=False)
gate(s,1055,camp,y=394)
report(s,second,(21000000,8700))

gate(s,60,field)
gate(s,1380,town)
if not comparison:
    (ROOT/'work/coop-original-prism-walker-fixture.json').write_text(json.dumps(checkpoint(s)),encoding='utf8')
core.action(s,'story_accept:'+third)
gate(s,60,field)
gate(s,720,camp)
gate(s,1020,water)
gate(s,1580,garden,y=390)
gate(s,1640,rim)
gate(s,1660,town,opened=False)
slot = s.fieldSlots[boss]
s.actors[2].hp = 0
move(s,slot.enemy.x-60)
for _ in range(180):
    if slot.cast:
        break
    batch(core,s,1)
cast = slot.cast
assert cast.move.id == 'MW01'
assert len(s.enemies) == 1 and len(cast.images) == 2
png = core.frame(s,'sprite','legacy')
arts = [d for d in png.draws.values() if d.source == 'prism-walker-source-v1.png']
assert len(arts) == 3 and sum(d.opacity == .23 for d in arts) == 2
boss_health = slot.enemy.hp
hit(s,cast.images[1])
assert slot.enemy.hp == boss_health
hit(s,slot.enemy.x)
normal_hit = boss_health-slot.enemy.hp
safe_hp = s.actors[1].hp
move(s,cast.images[1])
batch(core,s,cast.move.windup+cast.move.active)
assert s.actors[1].hp == safe_hp and slot.enemy.exposed
boss_health = slot.enemy.hp
hit(s,slot.enemy.x)
assert boss_health-slot.enemy.hp > normal_hit > 0

move(s,slot.enemy.x-60)
for _ in range(420):
    if slot.cast and slot.cast.move.id == 'MW02':
        break
    batch(core,s,1)
cast = slot.cast
assert cast.move.id == 'MW02'
move(s,(cast.left+cast.right)/2+200)
batch(core,s,cast.move.windup-1)
move(s,(cast.left+cast.right)/2)
batch(core,s,cast.move.active+1)
assert s.actors[1].hp == safe_hp-cast.move.damage
before = s.progression.questXp
hit(s,slot.enemy.x,2000)
assert slot.phase == 'respawn' and s.progression.questXp == before
count(s,third,1)
score = checkpoint(s)
s = core.restore(lua.table_from(score,recursive=True),12)
assert s.story.node == camp and s.fieldSlots[boss].phase == 'respawn'
gate(s,1020,water)
gate(s,1580,garden,y=390)
gate(s,1640,rim)
move(s,1530,389)
core.action(s,rotate)
count(s,third,2)
gate(s,1660,town)
assert not core.canEquipWeapon(s,'traveler','SW08')
report(s,third,(14095746,853650))
finished=restore(s)
assert finished.story.quests[third].status == 'complete'
assert core.canEquipWeapon(finished,'traveler','SW08')


def reenter_rim(state):
    gate(state, 60, field)
    gate(state, 720, camp)
    gate(state, 1020, water)
    gate(state, 1580, garden, y=390)
    gate(state, 1640, rim)

proof = dict(threeReflectors=True,blockedBeforeBridge=True,oneBridgeAfterRestore=True,
             wrongRecordRejected=True,darkAndLitRequired=True,recordedThreeOrientations=True,
             shortcutToCamp=True,afterimagesHaveNoHitbox=True,recoveryDamageBonus=True,
             laneDoesNotFollowTarget=True,killDoesNotGrantFirstReport=True,bossSaved=True,
             returnedViaRim=True,firstReport=[14095746,853650],fixedWeaponReward='SW08')
if comparison:
    profile = 'draft' if options.draft_balance else 'standard'
    output = ROOT/'work/moonlit-garden-balance'
    output.mkdir(exist_ok=True)
    (output/f'{profile}-sword-save.json').write_text(json.dumps(checkpoint(finished)),encoding='utf8')
    proof |= {'startedAtLevel': fixture['progression']['level'], 'usedEarnedSave': options.earned_save is not None}
    (ROOT/f'evidence/moonlit-garden-{profile}-route.json').write_text(json.dumps(proof,indent=2)+'\n',encoding='utf8')
else:
    check_original_boss_retry(lua, core, finished, boss, third, reenter_rim)
    (ROOT/'evidence/moonlit-garden-lua.json').write_text(json.dumps(proof,indent=2)+'\n',encoding='utf8')
    (ROOT/'work/moonlit-garden-fixture.json').write_text(json.dumps(fixture),encoding='utf8')
print(proof)
