import json
import sys
from hashlib import sha256
from test_coop_local import expand_rectangles

from experience import LEVELS, QUEST_REPORT_EXP
from runtime import ROOT, native, runtime
from savegame import validate_save


lua, core = runtime()
quest = 'ina-walking-teahouse'
town, forks, landing = 'inazuma-town', 'ina-tea-crossroads', 'ina-tea-landing'
advance = lua.eval('function(C,s,n,input) for _=1,n do C.step(s,1/60,input) end end')


def tick(n=1, **inputs):
    advance(core, s, n, lua.table_from(inputs))


def action(key):
    core.action(s, key)


def frame():
    return core.frame(s, 'sprite', 'legacy')


def move(x, y=480):
    actor = s.actors[s.active]
    actor.x, actor.y, actor.vy, actor.ground = x, y, 0, True


def gate(x, to, allowed=True):
    move(x)
    nearby = frame().storyNearbyPortal
    assert nearby and nearby.to == to and nearby.available is allowed, native(nearby)
    before = s.story.node
    action('story_nearby_portal')
    assert s.story.node == (to if allowed else before)


def record():
    return s.story.quests[quest]


def collect(x, count, y=480):
    move(x, y)
    assert frame().storyNearbyMilestone
    action('story_collect')
    assert record().count == count


def choose(card):
    action('story_tea_card:' + card)


def checkpoint():
    return validate_save(native(core.checkpoint(s)))


def load(data):
    return core.restore(lua.table_from(data, recursive=True), 12)


s = core.new(12)
action('story_start')
core.grantExp(s, LEVELS[39]['maple_reference_total_exp_to_reach'], 'quest')
core.enterStoryNode(s, town)
action('story_accept:' + quest)
assert not record()
s.story.visited['inazuma-port'] = True
for id_, count, details in (
    ('inazuma-moving-lantern', 6, {'lantern': {'inspected': {
        'box-leaf': True, 'stone-shadow': True, 'eaten-nuts': True}}}),
    ('inazuma-torii-maze', 5, {'forest': {'looped': True, 'defeated': {
        f'inazuma-thicket-{i}': True for i in range(1, 4)}}}),
):
    state = dict(status='complete', count=count, cycles=1, **details)
    s.story.quests[id_] = lua.table_from(state, recursive=True)
earned = '--earned' in sys.argv
suffix = '-earned' if earned else ''
if earned:
    source = ROOT/'work/inazuma-fresh-route/lantern-earned-start.json'
    raw = source.read_bytes()
    s = load(validate_save(json.loads(raw)))
    assert s.story.quests['inazuma-torii-maze'].status == 'complete'
    action('story_fast:' + town)
    assert s.story.node == town and not record()
initial_kills = s.kills
fixture = checkpoint()
packing = {}
map_frames = {}
catalog = json.loads((ROOT/'content/worksite-props.json').read_bytes())['teahouse']

def verify_art(step):
    stage = core.frame(s,'sprite','legacy')
    visible = [(d.source,list(d.box.values()),d.x,d.y,d.h) for d in stage.draws.values()
               if d.source in ('ina-tea-case-props-source-v1.png','nod-lantern-patrol-props-source-v1.png')]
    expected = []
    for mark in catalog['stages'][str(step)]:
        asset = json.loads((ROOT/'assets'/catalog['files'][mark['key']]).read_bytes())
        expected.append((asset['source'],asset['box'],mark['x']-s.camera,mark['y'],mark['height']))
    assert visible == expected, (visible,expected)
    layer = lua.table_from(dict(draws=[]),recursive=True)
    for mode in ('sprite','rect'):
        layer.draws = lua.table()
        for mark in catalog['stages'][str(step)]:
            core.drawFieldDisplayArt(layer,core.teaCaseArt[mark['key']],mark['x'],mark['y'],
                                     mark['height'],mode,'h32c16',False)
        map_frames.setdefault(step,{})[mode] = native(layer.draws)
    for profile in ('legacy','h32c16'):
        reference = {'draws':native(core.frame(s,'rect',profile).draws)}
        s.packRectArt = True
        try:
            f = core.frame(s,'rect',profile)
            packet = {'draws':native(f.draws),'rectBatches':native(f.rectBatches)}
        finally:
            s.packRectArt = None
        assert list(expand_rectangles(packet)) == reference['draws']
        before,after = (len(json.dumps(data,ensure_ascii=False,separators=(',',':')).encode())
                        for data in (reference,packet))
        assert after < before
        packing[f'{step}-{profile}'] = dict(before=before,after=after)
action('story_accept:' + quest)
gate(350, forks, False)
collect(169, 1)
collect(396, 2)
assert frame().storyTeaCase.clues == 1
action('story_collect')
assert record().count == 2 and '赤い菱印' in frame().storyNotice
gate(350, forks)
gate(1166, landing, False)
collect(345, 3)
move(744)
assert not frame().storyNearbyMilestone
action('jump')
tick(12, jump=True)
tick(45)
assert s.actors[s.active].ground and s.actors[s.active].y == 403
action('story_collect')
assert record().count == 4
gate(1166, landing)
assert not len(s.enemies) and s.kills == initial_kills
collect(284, 5)
assert frame().storyTeaCase.clues == 4
verify_art(6)

choose('ruts')
move(469)
assert not frame().storyTeaBoard.ready
assert not any(card.selected for card in frame().storyTeaBoard.cards.values())
choose('invalid')
choose('paper')
choose('day')
assert frame().storyTeaBoard.ready
choose('ruts')
assert '二枚まで' in frame().storyTeaBoard.feedback
action('story_tea_confirm')
assert record().count == 5 and '動いた痕跡' in frame().storyTeaBoard.feedback
choose('paper')
choose('ruts')
action('story_tea_confirm')
assert record().count == 5 and '船着き場' in frame().storyTeaBoard.feedback
choose('day')
choose('dusk')
action('story_tea_confirm')
assert record().count == 6 and not frame().storyTeaBoard
rolling = frame().storyTeaCase
assert rolling.cartX == 1060 and not rolling.parked
tick(45)
assert 697 < frame().storyTeaCase.cartX < rolling.cartX
move(600)
action('story_collect')
assert record().count == 6 and not frame().storyNearbyMilestone
action('pause')
frozen = frame().storyTeaCase.cartX
tick(180)
assert frame().storyTeaCase.cartX == frozen
action('pause')
midarrival = checkpoint()
tick(180)
assert frame().storyTeaCase.parked and frame().storyTeaCase.cartX == 697

s = load(midarrival)
assert record().count == 6 and s.story.node == town
action('story_fast:' + landing)
assert s.story.node == town
gate(350, forks)
gate(1166, landing)
assert frame().storyTeaCase.parked and frame().storyTeaCase.cartX == 697
actor = s.actors[s.active]
verify_art(7)
actor.hp = actor.maxhp - 45
collect(600, 7)
assert actor.hp == actor.maxhp - 10
gate(889, town)
assert record().status == 'active'
xp, mora = s.progression.questXp, s.mora
action('story_report:' + quest)
action('story_report:' + quest)
reward = [s.progression.questXp - xp, s.mora - mora]
assert reward == [QUEST_REPORT_EXP['Q-INA-S05'], 1750]
s = load(checkpoint())
action('story_fast:' + landing)
assert s.story.node == landing and frame().storyTeaCase.parked
assert frame().storyNearbyMilestone.label == 'お茶を飲んで休む'
actor = s.actors[s.active]
actor.hp = actor.maxhp - 10
collect(600, 7)
assert actor.hp == actor.maxhp and 'HPが10' in frame().storyNotice
collect(600, 7)
assert actor.hp == actor.maxhp and 'ひと休み' in frame().storyNotice
assert record().status == 'complete' and s.mora == mora + reward[1]
assert s.progression.questXp == xp + reward[0]
checkpoint()

proof = {
    'prerequisite': True, 'collectAndReread': True, 'requiredLedge': True,
    'twoWrongAnswersRetry': True, 'rangeAndCardLimit': True, 'arrivalAndPause': True,
    'saveMidarrival': True, 'noCombat': True, 'completedMapRest': True,
    'repeatRecoveryCapped': True, 'reward': reward,
}
proof['packing'] = packing
if earned:
    proof.update(startLevel=fixture['progression']['level'],source=source.name,sha256=sha256(raw).hexdigest())
(ROOT/f'evidence/ina-tea-case{suffix}-lua.json').write_text(json.dumps(proof, indent=2)+'\n', encoding='utf8')
(ROOT/'work').mkdir(exist_ok=True)
(ROOT/f'work/ina-tea-case{suffix}-fixture.json').write_text(json.dumps(fixture), encoding='utf8')
(ROOT/f'work/ina-tea-case{suffix}-map-frames.json').write_text(json.dumps(map_frames),encoding='utf8')
print(proof)
