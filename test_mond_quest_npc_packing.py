"""Verify NPC batches in their quest locations, including Noelle's seated pose."""
import json
import sys
from pathlib import Path

from runtime import native
from test_regional_quest_prop_packing import measure
from tools.domain_terrain_test import core, lua, write

scenes = [
    ('standing', 'mond-roadside-rest', 'mond-rest-stop', 2, 570, core.noelleArt.standing),
    ('seated', 'mond-roadside-rest', 'mond-rest-stop', 5, 570, core.noelleArt.seated),
    ('ledge', 'mond-bennett-ledge', 'mond-bennett-cave', 1, 0, core.bennettArt),
    ('depth', 'mond-bennett-depth', 'mond-bennett-cave', 3, 0, core.bennettArt),
]
results = {}
snapshots = []
capture = len(sys.argv) == 3 and sys.argv[1] == "--capture"
for scene, node, quest, count, camera, art in scenes:
    state = core.new(12)
    core.action(state, 'story_start')
    state.story.quests[quest] = lua.table_from(dict(status='active', count=count, cycles=0))
    core.enterStoryNode(state, node)
    state.camera = camera
    results[scene] = {}
    for profile in ('legacy', 'h48c32', 'h32c16'):
        results[scene][profile] = measure(core, state, profile)
        state.packRectArt = True
        frame = core.frame(state, 'rect', profile)
        state.packRectArt = None
        runs = native(art.profiles[profile].runs)
        batches = native(frame.rectBatches)
        stamps = [d for d in native(frame.draws) if d['kind'] == 'rect_runs']
        assert any(batches[d['batch']-1] == runs for d in stamps), (scene, profile)
        if capture:
            sprites = native(core.frame(state, 'sprite', profile).draws)
            sprite = next(d for d in sprites if d.get('source') == art.source and d['box'] == native(art.box))
            reference = native(core.frame(state, 'rect', profile).draws)
            snapshots.append(dict(scene=scene, profile=profile, sprite=sprite, reference=reference,
                                  packed=native(frame.draws), batches=batches))
    print(scene, results[scene]['h32c16'])
write('evidence/mond-quest-npc-packing.json', results)

if capture:
    Path(sys.argv[2]).write_text(json.dumps(snapshots), encoding='utf8')
