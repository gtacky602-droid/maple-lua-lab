"""Round-trip a prepared save spanning the whole atlas through the HTTP adapter."""

import json
from urllib.error import HTTPError

from experience import LEVELS
from runtime import ROOT, native, runtime
from savegame import validate_save
from test_coop_local import Client, lab


lua, core = runtime()
state = core.new(12)
core.action(state, 'story_start')
core.grantExp(state, LEVELS[199]['maple_reference_total_exp_to_reach'], 'quest')
graph = json.loads((ROOT/'content/story-graph.json').read_text(encoding='utf8'))
state.story.visited = lua.table_from({node['id']: True for node in graph['nodes']})
state.story.discovered = lua.table_from({
    node['hiddenGroup']: True for node in graph['nodes'] if node.get('hiddenGroup')
})
for _ in range(80):
    assert core.giveArtifact(state, 2, 220, 5)
core.action(state, 'artifact_equip:1')
for slot in range(1, 4):
    core.action(state, f'party_preset_store:{slot}')
for index in range(160):
    core.dropArtifact(state, 1, 220, 5, 250+index, 480, None, 'story:mond-road')
core.enterStoryNode(state, 'mond-road')
save = validate_save(native(core.checkpoint(state)))
raw = json.dumps(save, ensure_ascii=False, separators=(',', ':')).encode()
assert len(raw) > 64*1024
fixture = ROOT/'work/full-atlas-checkpoint.json'
fixture.parent.mkdir(exist_ok=True)
fixture.write_bytes(raw)

with lab() as url:
    player = Client(url)
    restored = player.frame(restore=save, checkpoint=True)
    result = validate_save(restored['checkpoint'])
    assert result['story']['node'] == 'mond-town'
    assert result['story']['visited'] == save['story']['visited']
    assert result['story']['discovered'] == save['story']['discovered']
    assert result['inventory'] == save['inventory']
    assert result['partyPresets'] == save['partyPresets']
    assert result['progression'] == save['progression']
    for body in ({'extra': 'x'*(65*1024)}, {'restore': save, 'extra': 'x'*(273*1024)}):
        try:
            player.frame(**body)
        except HTTPError as exc:
            assert exc.code == 400
        else:
            raise AssertionError('Request exceeded its size limit')
    assert player.frame()['session'] == restored['session']

proof = {
    'preparedFixture': True,
    'utf8CheckpointBytes': len(raw),
    'visitedNodes': len(save['story']['visited']),
    'hiddenGroups': len(save['story']['discovered']),
    'bagItems': len(save['inventory']['items']),
    'groundDrops': len(save['inventory']['ground']),
    'presets': len(save['partyPresets']),
    'restoredViaHttp': True,
    'ordinaryRequestLimitPreserved': True,
    'oversizedRestoreRejected': True,
}
(ROOT/'evidence/full-atlas-checkpoint-http.json').write_text(json.dumps(proof, indent=2)+'\n', encoding='utf8')
print('HTTP restored the full atlas, artifact storage, presets and Lv200 state.')
