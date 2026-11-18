"""Verify growth milestones through the actual swap, combat, and inventory actions."""
from copy import deepcopy
import json

from experience import LEVELS
from runtime import ROOT, native, runtime
from savegame import validate_save


lua, core = runtime()
mon, liy, ina, sumeru = 'mond-town', 'liyue-harbor', 'inazuma-port', 'sumeru-hub'
partner, gear, upgrade, inherit = ('growth-' + key for key in (
    'partner-swap', 'targeted-gear', 'upgrade-gear', 'inherit-gear'))


def begin():
    state = core.new(12)
    core.action(state, 'story_start')
    return state


def act(s, action):
    core.action(s, action)


def visit(s, level, node):
    target = LEVELS[level - 1]['maple_reference_total_exp_to_reach']
    core.grantExp(s, max(0, target - s.progression.baseXp), 'quest')
    core.enterStoryNode(s, node)


def saved(s):
    return validate_save(native(core.checkpoint(s)))


def restore(data):
    return core.restore(lua.table_from(validate_save(data), recursive=True))


def accepted(s, quest):
    act(s, 'story_accept:' + quest)
    return s.story.quests[quest]


def report(s, quest, xp, mora, ore=0):
    before = s.progression.questXp, s.mora, s.inventory.upgradeOre
    act(s, 'story_report:' + quest)
    act(s, 'story_report:' + quest)
    assert s.story.quests[quest].status == 'complete'
    assert (s.progression.questXp, s.mora, s.inventory.upgradeOre) == tuple(
        start + reward for start, reward in zip(before, (xp, mora, ore)))


def write_json(path, value):
    (ROOT / path).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf8')


s = begin()
old_save = saved(s)
assert 'growth' not in old_save['story']
assert accepted(s, partner) is None
old_save['story']['quests']['amber-join'] = {'status': 'complete', 'count': 4, 'cycles': 1}
write_json('work/growth-foundations-fixture.json', old_save)
s = restore(old_save)
assert accepted(s, partner).count == 0
core.enterStoryNode(s, 'mond-road')
s.active = 2
amber = s.actors[2]
amber.x, amber.dir = 260, 1
amber.hp, s.actors[1].hp = 115, 102
s.actors[1].cd.skill1 = 8
act(s, 'normal')
act(s, 'swap')
assert s.active == 1 and s.story.quests[partner].count == 1
assert (s.actors[1].x, s.actors[1].hp, amber.hp, s.actors[1].cd.skill1) == (260, 102, 115, 8)
for actor in s.actors.values():
    actor.lock = 999
advance = lua.eval('function(C,s,n) for i=1,n do C.step(s,1/60,{}) end end')
advance(core, s, 22)
assert s.hits > 0 and not s.story.growth['ai-hit']
amber.lock = 0
advance(core, s, 60)
assert s.story.growth['ai-hit'] is True and s.story.quests[partner].count == 2
s = restore(saved(s))
assert s.story.node == mon and s.story.growth['manual-swap']
report(s, partner, 200, 120)

another = begin()
act(another, 'companion:columbina')
core.enterStoryNode(another, 'mond-road')
another.actors[2].x = 260
advance(core, another, 140)
assert another.story.growth['ai-hit'] is True

visit(s, 20, liy)
assert not s.inventory['items'][1]
act(s, 'target_set:troupe')
before = native(s.inventory)
act(s, 'artifact_example:compare')
comparison = core.frame(s).artifactPreview
assert comparison.kind == 'compare' and comparison.targetSet == 'troupe'
assert comparison.before.setId == 'gladiator' and comparison.after.setId == 'troupe'
assert native(s.inventory) == before
assert accepted(s, gear).count == 2
report(s, gear, 2400, 450, 1)

visit(s, 40, ina)
assert accepted(s, upgrade).count == 0
before = s.mora, native(s.inventory)
act(s, 'artifact_example:upgrade')
view = core.frame(s).artifactPreview
assert view.after.stat > view.before.stat and view.cost == 20000
assert (s.mora, native(s.inventory)) == before
report(s, upgrade, 12800, 1700, 1)

visit(s, 60, sumeru)
assert accepted(s, inherit).count == 0
before = s.mora, native(s.inventory)
act(s, 'artifact_example:inherit')
view = core.frame(s).artifactPreview
assert view.example and view.cost == 540000
assert view.after.setId == 'troupe' and view.after.stars == 2
assert (s.mora, native(s.inventory)) == before
report(s, inherit, 26500, 2300, 1)
learned = saved(s)
for change in ({'unrecognized': True}, {'inherit-preview': False}, {}):
    broken = deepcopy(learned)
    broken['story']['growth'] = change
    try:
        validate_save(broken)
    except ValueError:
        pass
    else:
        raise AssertionError('Invalid or inconsistent growth evidence was accepted')

# Actual inheritance keeps the recipient's base attributes and costs the displayed fee once.
starter = lua.table_from({'setId': 'gladiator', 'subpair': 'atk_crit'})
upgrade_target = lua.table_from({'setId': 'troupe', 'subpair': 'hp_crit'})
assert core.giveArtifact(s, 2, 21, 5, starter)
assert core.giveArtifact(s, 2, 70, 5, upgrade_target)
assert core.giveArtifact(s, 1, 70, 5, upgrade_target)
source, target = s.inventory['items'][1], s.inventory['items'][2]
source.enhance, source.imprintStars = 20, 5
s.mora = 2000000
act(s, 'artifact_inherit_confirm:1:2')
assert s.mora == 2000000
act(s, 'artifact_inherit_preview:1:3')
assert core.frame(s).artifactPreview.error
act(s, 'artifact_lock:1')
act(s, 'artifact_inherit_preview:1:2')
assert core.frame(s).artifactPreview.error
act(s, 'artifact_lock:1')
act(s, 'artifact_equip:1')
act(s, 'artifact_inherit_preview:1:2')
assert core.frame(s).artifactPreview.error
act(s, 'artifact_remove:1')
act(s, 'artifact_inherit_preview:1:2')
view = core.frame(s).artifactPreview
assert view.cost == 1980000 and view.after.itemLv == 70
before = native(s.inventory)
s.mora = view.cost - 1
act(s, 'artifact_inherit_confirm:1:2')
assert native(s.inventory)['items'] == before['items'] and s.mora == 1979999
s.mora = 2000000
act(s, 'artifact_equip:2')   # A changed recipient invalidates the earlier preview.
act(s, 'artifact_inherit_confirm:1:2')
assert s.mora == 2000000
act(s, 'artifact_inherit_preview:1:2')
write_json('work/growth-inherit-fixture.json', saved(s))
act(s, 'artifact_inherit_confirm:1:2')
act(s, 'artifact_inherit_confirm:1:2')
assert s.mora == 20000 and [i.id for i in s.inventory['items'].values()] == [2, 3]
assert (target.itemLv, target.rarity, target.setId, target.subpair, target.owner, target.enhance, target.imprintStars) == (
    70, 5, 'troupe', 'hp_crit', 1, 20, 5)
s = restore(saved(s))
assert s.inventory['items'][1].id == 2 and core.frame(s).artifactPreview is None

write_json('evidence/growth-foundations-lua.json', {
    'designIdsReported': ['Q-G01', 'Q-G02', 'Q-G03', 'Q-G04'],
    'oldSaveLoadsAndAwardIsOnce': True,
    'manualDelayedAttackDoesNotCountAsAI': True,
    'actualAIHitAndManualSwapPersist': True,
    'swapPreservesLocationAndIndividualHealthAndCooldown': True,
    'alternateCompanionPendingCastCounts': True,
    'earlierActionsRecognizedAtAcceptance': True,
    'trainingHasNoInventoryOrCurrencySideEffects': True,
    'incompatibleLockedOrEquippedDonorsRejected': True,
    'insufficientBalanceAndStalePreviewRejected': True,
    'paidInheritanceConsumesSourceOnceAndPreservesRecipientBaseStats': True,
    'maxPrototypeInheritanceFee': 1980000,
})
for level, node in ((20, liy), (40, ina), (60, sumeru)):
    state = begin()
    visit(state, level, node)
    write_json(f'work/growth-level-{level}.json', saved(state))
print('Growth Q-G01–04: actual swap and AI provenance, three previews, saved reports and paid inheritance passed')
