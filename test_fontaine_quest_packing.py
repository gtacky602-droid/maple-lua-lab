from tools.domain_terrain_test import core, lua, write
from test_regional_quest_prop_packing import measure

# Keep the repeated curtain and buoys on camera to verify shared art references.
scenes = [
    ('fontaine-rehearsal-room', 'fon-furina-cues', 3, 520, None),
    ('fon-photo-terrace', 'fon-navia-photo', 1, 470, None),
    ('fon-magic-seats', 'fon-lyney-magic', 6, 530, 'curtain'),
    ('fon-toy-shallows', 'fon-freminet-dive', 1, 0, None),
]
results = {}
for node, quest, count, camera, choice in scenes:
    state = core.new(12)
    core.action(state, 'story_start')
    record = dict(status='active', count=count, cycles=0)
    if choice:
        record['storyChoice'] = choice
    state.story.quests[quest] = lua.table_from(record)
    core.enterStoryNode(state, node)
    state.camera = camera
    results[node] = {profile: measure(core, state, profile)
                     for profile in ('legacy', 'h48c32', 'h32c16')}
    print(node, results[node]['h32c16'])
    if node in ('fon-magic-seats', 'fon-toy-shallows'):
        assert all(m['stamps'] > m['batches'] for m in results[node].values())
write('evidence/fontaine-quest-packing.json', results)
