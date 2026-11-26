from test_regional_quest_prop_packing import measure
from tools.domain_terrain_test import core, lua, write
from runtime import native

scenes = [
    ('liyue-crux-wharf', 'beidou-join', 3, 250, {'recovered': dict(pier=True, ledge=True, rocks=True)}),
    ('sne-survey-shed', 'sne-mitya-observation', 0, 0, {}),
    ('sne-survey-yard', 'sne-mitya-observation', 3, 130, {}),
    ('sne-survey-ridge', 'sne-mitya-observation', 7, 750, {}),
]
report = {}
for node, quest, count, camera, extra in scenes:
    state = core.new(12)
    core.action(state, 'story_start')
    state.story.quests[quest] = lua.table_from(dict(status='active', count=count, cycles=0, **extra), recursive=True)
    core.enterStoryNode(state, node)
    state.camera = camera
    row = {}
    for profile in ('legacy', 'h48c32', 'h32c16'):
        row[profile] = measure(core, state, profile)
        state.packRectArt = True
        f = core.frame(state, 'rect', profile)
        state.packRectArt = None
        batches = native(f.rectBatches)
        if node.endswith('wharf') or node.endswith('shed'):
            art = core.companionArt['beidou' if node.endswith('wharf') else 'mitya']
            expected = (art.left or art).profiles[profile].runs
        else:
            expected = core.surveyEquipment['lens'].profiles[profile].runs
        batch = batches.index(native(expected)) + 1
        uses = sum(d.kind=='rect_runs' and d.batch==batch for d in f.draws.values())
        assert uses >= (2 if node.endswith('yard') else 1)
    report[node] = row
    print(node, row['h32c16'])
write('evidence/expedition-guide-packing.json', report)
