"""Exercise the growth lessons using equipment, joins and real combat resolution."""
from copy import deepcopy
import json

from experience import LEVELS
from runtime import ROOT, native, runtime
from savegame import validate_save


lua, core = runtime()
first, pair, moon, star = ('growth-' + key for key in (
    'first-imprint', 'pair-imprint', 'lunar-practice', 'star-practice'))
advance = lua.eval('function(C,s,n) for i=1,n do C.step(s,1/60,{}) end end')


def act(state, key):
    core.action(state, key)


def town(level, node):
    state = core.new(12)
    act(state, 'story_start')
    target = LEVELS[level - 1]['maple_reference_total_exp_to_reach']
    core.grantExp(state, target, 'quest')
    core.enterStoryNode(state, node)
    return state


def snapshot(state):
    return validate_save(native(core.checkpoint(state)))


def restore(data):
    return core.restore(lua.table_from(validate_save(data), recursive=True))


def write(path, data):
    (ROOT / path).write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf8')


def accept(state, quest):
    act(state, 'story_accept:' + quest)
    return state.story.quests[quest]


def report(state, quest):
    act(state, 'story_report:' + quest)
    assert state.story.quests[quest].status == 'complete'
    reward = state.mora, state.inventory.upgradeOre, state.progression.questXp
    act(state, 'story_report:' + quest)
    assert reward == (state.mora, state.inventory.upgradeOre, state.progression.questXp)


def item(state, slot, owner, companion='', stars=0, ready=True):
    assert core.giveArtifact(state, slot, 45, 5)
    gear = state.inventory['items'][len(state.inventory['items'])]
    gear.owner, gear.companionId = owner, companion or None
    gear.enhance, gear.imprintStars = (20 if ready else 0), stars or None
    core.refreshArtifactStats(state)
    return gear.id


def joined(level, node, join, count):
    checkpoint = snapshot(town(level, node))
    checkpoint['story']['quests'][join] = {'status': 'complete', 'count': count, 'cycles': 1}
    return restore(checkpoint)


def training_target(state, node, x=260):
    core.enterStoryNode(state, node)
    enemy = state.enemies[1]
    assert enemy.spawnId
    enemy.x, enemy.home, enemy.y, enemy.hp, enemy.maxhp, enemy.cd = x, x, 480, 50000, 50000, 999
    enemy.invulnerable = False
    state.enemies = lua.table_from([enemy])
    for actor in state.actors.values():
        actor.x, actor.y, actor.dir = 200, 480, 1
    state.actors[2].lock = 999
    return enemy


s = town(1, 'mond-town')
write('work/growth-imprint-lv1.json', snapshot(s))
assert accept(s, first).count == 0
s.gauge = 37
act(s, 'artifact_example:imprint')
view = core.frame(s).artifactPreview
assert (view.before.stars, view.after.stars, view.cost) == (0, 1, 200000)
assert (s.mora, s.gauge, len(s.inventory['items'])) == (0, 37, 0)
assert s.story.quests[first].count == 1
report(s, first)
assert restore(snapshot(s)).story.quests[first].status == 'complete'

real = town(1, 'mond-town')
unfinished = item(real, 2, 0, ready=False)
act(real, f'artifact_stampview:{unfinished}')
assert core.frame(real).artifactPreview.error and real.story.growth is None
equipped = item(real, 1, 1)
real.mora = 200000
act(real, f'artifact_imprint:{equipped}')
assert real.mora == 0 and core.partyImprint(real) == 1
assert accept(real, first).count == 1

p = town(100, 'natlan-hub')
assert accept(p, pair) is None
for slot in range(1, 6):
    item(p, slot, 1, stars=5)
    item(p, slot, 2, 'beidou', 5)
item(p, 1, 2, 'amber', 1)
item(p, 1, 2, 'ayaka', 4)
item(p, 1, 0, stars=5)
assert accept(p, pair).count == 0
write('work/growth-party-imprint.json', snapshot(p))
p.gauge, p.actors[1].hp, p.actors[2].hp, p.actors[2].cd.skill1 = 41, 60, 49, 7
act(p, 'artifact_pair_preview:amber')
act(p, 'artifact_pair_preview:unknown')
assert p.story.quests[pair].count == 0
act(p, 'artifact_pair_preview:beidou')
comparison = core.frame(p).artifactPreview
assert (comparison.before.total, comparison.after.total) == (26, 50)
assert [t.barrier for t in comparison.barriers.values()] == [3, 8, 10, 13, 25, 30, 35, 40, 50]
assert (comparison.barriers[9].before, comparison.barriers[9].after) == (57, 100)
assert len(comparison.before.traveler) == len(comparison.after.partner) == 5
assert p.companion in (None, 'amber') and (p.gauge, p.actors[1].hp, p.actors[2].hp, p.actors[2].cd.skill1) == (41, 60, 49, 7)
act(p, 'companion:beidou')
assert core.partyImprint(p) == 50
p.actors[2].hp, p.actors[2].cd.skill1 = 76, 11
advance(core, p, 60)
act(p, 'companion:amber')
assert p.actors[2].hp == 49 and round(p.actors[2].cd.skill1, 4) == 6
act(p, 'companion:beidou')
assert p.actors[2].hp == 76 and round(p.actors[2].cd.skill1, 4) == 10
assert p.gauge == 41 and p.actors[1].hp == 60
report(p, pair)

no_join = town(120, 'nod-port')
act(no_join, 'companion:columbina')
assert accept(no_join, moon) is None

moon_checks = {}
for move, kind in [('SK05', '月結晶'), ('SK09', '月感電'), ('SK13', '月開花')]:
    m = joined(120, 'nod-port', 'columbina-join', 4)
    act(m, 'companion:columbina')
    if move == 'SK09':
        core.configure(m, lua.table_from([[move]] + [[] for _ in range(7)], recursive=True))
        write('work/growth-lunar-lv120.json', snapshot(m))
    assert accept(m, moon).count == 0 and not core.attack(m, m.actors[1], 'SK54')
    foe = training_target(m, 'nod-field')
    a, b = m.actors[1], m.actors[2]
    b.lock = 0
    assert core.attack(m, b, 'normal')
    advance(core, m, 20)
    assert foe.aura.element == 'hydro' and foe.aura.companion == 'columbina'
    assert m.story.quests[moon].count == 0
    assert core.attack(m, a, move)
    advance(core, m, 20)
    assert core.frame(m).companion.moonReaction == kind and m.story.quests[moon].count == 1
    core.enterStoryNode(m, 'nod-port')
    report(m, moon)
    moon_checks[move] = kind

for level, skill, mark in [(127, 'SK54', 'lunar-orb'), (133, 'SK55', 'lunar-ring')]:
    m = joined(level, 'nod-port', 'columbina-join', 4)
    act(m, 'companion:columbina')
    assert accept(m, moon).count == 0
    training_target(m, 'nod-field')
    a = m.actors[1]
    assert core.attack(m, a, skill)
    assert m.story.quests[moon].count == 0
    advance(core, m, 61)
    assert m.story.growth[mark] and m.story.quests[moon].count == 1
    assert restore(snapshot(m)).story.growth[mark]

c = town(155, 'mond-town')
act(c, 'companion:beidou')
assert not core.attack(c, c.actors[1], 'SK57')
assert accept(town(148, 'snezhnaya-hub'), star) is None
for level, companion, skill, mark in [(149, 'wanderer', 'SK56', 'star-wind'),
                                     (155, 'beidou', 'SK57', 'star-electro'),
                                     (155, 'mitya', 'SK57', 'star-electro')]:
    t = town(level, 'snezhnaya-hub')
    act(t, 'companion:' + companion)
    if companion == 'wanderer':
        core.configure(t, lua.table_from([[skill]] + [[] for _ in range(7)], recursive=True))
        write('work/growth-star-lv149.json', snapshot(t))
    assert accept(t, star).count == 0
    training_target(t, 'snezhnaya-field')
    a = t.actors[1]
    assert core.attack(t, a, skill)
    assert t.story.quests[star].count == 0
    advance(core, t, 61)
    assert t.story.quests[star].count == 1 and t.story.growth[mark]
    core.enterStoryNode(t, 'snezhnaya-hub')
    report(t, star)
    checkpoint = snapshot(t)
    assert restore(checkpoint).story.growth[mark]
    tampered = deepcopy(checkpoint)
    tampered['story']['growth']['unknown-practice'] = True
    try:
        validate_save(tampered)
    except ValueError:
        pass
    else:
        raise AssertionError('unknown practice evidence accepted')

write('evidence/growth-practice-lua.json', {
    'imprint_lesson_level': 1, 'first_star_cost': 200000, 'empty_bag_dry_run': True,
    'active_pair': [26, 50], 'barriers': [3, 8, 10, 13, 25, 30, 35, 40, 50],
    'companion_hp_cooldowns_and_gauge': True, 'lunar_reactions': moon_checks,
    'moon_skill_levels': [127, 133], 'star_skill_levels': [149, 155],
    'star_partners': ['wanderer', 'beidou', 'mitya'],
    'save_and_duplicate_report_verified': True,
})
print('Growth Q-G05–08: imprint, all barriers, three lunar reactions, four milestones and save passed')
