"""Walk both M02 branches without movement or combat stat overrides."""
import json
from copy import deepcopy

from runtime import ROOT, native, runtime
from savegame import validate_save

lua, core = runtime()
M01 = 'amber-join'
M02 = 'mond-old-trail'
s = core.new(12)
core.action(s, 'story_start')
core.action(s, 'story_accept:' + M02)
assert not s.story.quests[M02]
seed = native(core.checkpoint(s))
seed['story']['quests'][M01] = {'status':'complete','count':4,'cycles':1}
validate_save(seed)
(ROOT/'work').mkdir(exist_ok=True)
(ROOT/'work/mondstadt-m02-fixture.json').write_text(json.dumps(seed), encoding='utf8')


def step(s, **keys):
    core.step(s, 1/60, lua.table_from(keys))


def walk(s, x, attack=False):
    for _ in range(720):
        actor = s.actors[s.active]
        if abs(actor.x - x) < 8:
            return
        step(s, right=actor.x < x, left=actor.x > x, attack=attack)
    raise AssertionError(('cannot walk', s.story.node, x))


def jump(s, y):
    core.action(s, 'jump')
    for _ in range(120):
        step(s, jump=True)
        actor = s.actors[s.active]
        if actor.ground and actor.y == y:
            return
    raise AssertionError(('cannot jump onto platform', s.story.node, y))


def gate(s, expected):
    portal = core.frame(s).storyNearbyPortal
    assert portal and portal.to == expected and portal.available
    core.action(s, 'story_nearby_portal')
    assert s.story.node == expected


def locked(s, expected):
    portal = core.frame(s).storyNearbyPortal
    assert portal and portal.to == expected and not portal.available
    old = s.story.node
    core.action(s, 'story_portal:' + expected)
    assert s.story.node == old
    assert '依頼' in s.storyNotice


walk(s, 1330)
gate(s, 'mond-road')
walk(s, 895)
locked(s,'mond-old-road')

reports = []
for branch, clue in [('mond-old-ground','wheel-ruts'),('mond-old-canopy','red-cloth')]:
    s = core.restore(lua.table_from(seed, recursive=True))
    core.action(s, 'story_accept:' + M02)
    q = s.story.quests[M02]
    assert q.count == 0
    walk(s, 1330)
    gate(s, 'mond-road')
    walk(s, 895)
    gate(s, 'mond-old-road')
    if branch == 'mond-old-canopy':
        walk(s,740)
        core.action(s, 'story_portal:' + branch)
        assert s.story.node == 'mond-old-road'
        walk(s,520)
        jump(s,390)
        jump(s,300)
        walk(s,740)
        gate(s,branch)
        walk(s,510)
        jump(s,390)
        jump(s,305)
        walk(s,855)
        jump(s,220)
        walk(s,1220)
        locked(s,'mond-hill')
        walk(s,855)
        core.action(s,'drop')
        for _ in range(90):
            step(s)
            if s.actors[s.active].ground and s.actors[s.active].y==305:
                break
        walk(s,700)
    else:
        walk(s,1330)
        gate(s,branch)
        walk(s,1330)
        locked(s,'mond-hill')
        walk(s,660,attack=True)
    assert core.frame(s).storyNearbyClue.id == clue
    core.action(s, 'story_collect')
    core.action(s, 'story_collect')
    assert dict(q.inspected.items()) == {clue:True}
    assert q.count == 1
    part = native(core.checkpoint(s))
    validate_save(part)
    resumed = core.restore(lua.table_from(part, recursive=True))
    assert resumed.story.quests[M02].inspected[clue] and resumed.story.quests[M02].count == 1
    if branch == 'mond-old-canopy':
        walk(s,855)
        jump(s,220)
        walk(s,1220)
    else:
        walk(s,1330,attack=True)
    gate(s,'mond-hill')
    core.action(s,'story_report:' + M02)
    assert q.status == 'active'
    walk(s,662,attack=True)
    for _ in range(420):
        if q.count==2:
            break
        step(s,attack=True)
    assert q.count == 2, (branch, s.story.node, s.kills)
    walk(s,1650)
    gate(s,'mond-road')
    walk(s,104)
    gate(s,'mond-town')
    before, xp=s.mora,s.progression.questXp
    core.action(s,'story_report:' + M02)
    core.action(s,'story_report:' + M02)
    assert (s.mora,s.progression.questXp)==(before+140,xp+2486)
    assert (q.status,q.cycles)==('complete',1)
    saved=validate_save(native(core.checkpoint(s)))
    restored=core.restore(lua.table_from(saved, recursive=True))
    assert restored.story.quests[M02].status=='complete'
    walk(restored,1330)
    gate(restored,'mond-road')
    walk(restored,270)
    jump(restored,350)
    gate(restored,'mond-hill')
    for mutate in ('missing_clue','missing_prerequisite'):
        bad=deepcopy(saved)
        if mutate=='missing_clue':
            bad['story']['quests'][M02]['inspected']={}
        else:
            del bad['story']['quests'][M01]
        try:
            validate_save(bad)
        except ValueError:
            pass
        else:
            raise AssertionError(f'Accepted {mutate}')
    reports.append({'route':branch,'clue':clue,'fight':True,'shortcut_after_report':True,
                    'partial_save':True,'reward_xp':2486,'reward_mora':140})

(ROOT/'evidence/mondstadt-m02-lua.json').write_text(json.dumps({'routes':reports,'prerequisite':True,
    'hill_requires_clue':True,'elevated_gate_requires_correct_height':True,
    'duplicate_reward_rejected':True},indent=2)+'\n',encoding='utf8')
print('Mondstadt M02 upper and lower routes, shortcut, save and reports passed')
