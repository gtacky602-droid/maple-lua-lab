"""Round-trip every registered controller through the shared checkpoint adapter."""
import json

from experience import LEVELS
from runtime import ROOT, native, runtime
from savegame import validate_save

lua, core = runtime()
specs = json.loads((ROOT/'content/field-boss-spawns.json').read_text(encoding='utf8'))['fieldBosses']
checked = []
for spec in specs:
    state = core.new(12)
    core.action(state, 'story_start')
    core.grantExp(state, LEVELS[199]['maple_reference_total_exp_to_reach'], 'quest')
    core.enterStoryNode(state, spec['node'])
    slot = state.fieldSlots[spec['id']]
    slot.enemy.hp = spec['hp']-1
    saved = validate_save(native(core.checkpoint(state)))
    data = saved['fieldBosses'][spec['id']]
    assert (data['hp'], data['generation'], data['waitTicks']) == (spec['hp']-1, 1, 0)
    assert set(data.get('flags', {})) == set(spec.get('saveFlags', []))
    restored = core.restore(lua.table_from(saved, recursive=True), 12)
    fresh = restored.fieldSlots[spec['id']]
    assert fresh.enemy.hp == spec['hp']-1 and fresh.cast is None and fresh.generation == 1
    core.enterStoryNode(restored, spec['node'])
    assert sum(e.fieldBoss == spec['id'] and e.id == spec['entity'] for e in restored.enemies.values()) == 1
    checked.append(spec['id'])

result = dict(controllers=len(checked), ids=checked, hpAndGenerationRoundTrip=True,
              optionalFlagsOnlyOnDeclaredControllers=True,
              reentryAttachesOnePrimary=True)
(ROOT/'evidence/field-save-contract.json').write_text(json.dumps(result, indent=2)+'\n', encoding='utf8')
print(f'{len(checked)} field-controller checkpoint round-trips passed')
