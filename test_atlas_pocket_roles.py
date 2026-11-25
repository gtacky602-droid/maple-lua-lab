"""Compare the hunt atlas and its room entrances with the placement design."""
from collections import Counter
from pathlib import Path

from tools.domain_terrain_test import core, nodes, placements, read, write


roles = {}
for path in sorted(Path('design/world/placements').glob('*.json')):
    for field in read(path).get('fields', []):
        for pocket in field.get('optional_pockets', []):
            role = pocket['combat_role']
            assert roles.setdefault(pocket['id'], role) == role

expected = {}
for room, enemies in placements.items():
    assigned = {roles.get(enemy.get('designSpawn')) for enemy in enemies}
    if assigned in ({'rare_pocket'}, {'optional_elite'}):
        expected[room] = assigned.pop()

s = core.new(12)
core.action(s, 'story_start')
# Provide discovery progress so the test includes the rooms on hidden islands.
for room in expected:
    if group := nodes[room].get('hiddenGroup'):
        s.story.discovered[group] = True

records = {}
core.action(s, 'world_map_toggle')
for region in read('content/world-atlas.json')['regions']:
    core.action(s, 'world_map_region:' + region['id'])
    core.action(s, 'world_map_layer:hunt')
    for pin in core.frame(s).worldMap.points.values():
        if not pin.pocketRole:
            continue
        assert pin.id not in records
        assert pin.pocketRole == expected[pin.id]
        records[pin.id] = pin.pocketRole
assert records == expected

entrances = 0
for room, role in expected.items():
    incoming = [(parent, edge) for parent, node in nodes.items()
                for edge in node['exits'] if edge['to'] == room]
    assert incoming, room
    for parent, edge in incoming:
        core.action(s, 'world_map_focus:' + parent)
        view = core.frame(s).worldMap
        assert view.selected.id == parent
        entry, = [r for r in view.routes.values() if r.id == room]
        assert (entry.pocketRole, entry.entryHeight) == (role, edge.get('y', 480))
        entrances += 1
    core.action(s, 'world_map_focus:' + room)
    selected = core.frame(s).worldMap.selected
    assert (selected.id, selected.pocketRole) == (room, role)

counts = dict(Counter(records.values()))
write('evidence/atlas-pocket-roles.json', {'verifiedRoles': counts, 'verifiedEntrances': entrances})
print(counts, 'all room pins, selected details and entrances passed.')
