"""Round-trip every registered controller through the shared checkpoint adapter."""
import json

from experience import LEVELS
from runtime import ROOT, native, runtime
from savegame import validate_save

lua, core = runtime()
specs = json.loads((ROOT/'content/field-boss-spawns.json').read_text(encoding='utf8'))['fieldBosses']
quests = {quest['id']: quest for quest in
          json.loads((ROOT/'content/story-graph.json').read_text(encoding='utf8'))['quests']}


def seed_chapter(state, quest_id, completed_count, status):
    quest = quests[quest_id]
    if previous := quest.get('requires'):
        seed_chapter(state, previous, quests[previous]['goal'], 'complete')
    record = dict(status=status,count=completed_count,cycles=int(status=='complete'))
    state.story.visited[quest['hub']] = True
    for item in quest.get('itinerary',[])[:completed_count]:
        state.story.visited[item['node']] = True
        config = item.get('airflow',{})
        if config.get('stagePlan'):
            record['stagePlan'] = config['choices'][0]['id']
        if item['kind']=='choice':
            record['storyChoice'] = item['choices'][0]['id']
    if paths := quest.get('paths'):
        joined=any(item['kind']=='paths' for item in quest['itinerary'][:completed_count])
        record['pathProgress']={}
        for path in paths:
            record['pathProgress'][path['id']]=dict(count=len(path['steps']) if joined else 0)
            if joined:
                for item in path['steps']:
                    state.story.visited[item['node']]=True
    state.story.quests[quest_id] = lua.table_from(record,recursive=True)


checked = []
manual = []
for spec in specs:
    state = core.new(12)
    core.action(state, 'story_start')
    core.grantExp(state, LEVELS[199]['maple_reference_total_exp_to_reach'], 'quest')
    if window := spec.get('storyWindow'):
        core.enterStoryNode(state, spec['node'])
        assert not state.fieldSlots or state.fieldSlots[spec['id']] is None
        seed_chapter(state, window['quest'], window['first'], 'active')
    core.enterStoryNode(state, spec['node'])
    slot = state.fieldSlots[spec['id']]
    slot.enemy.hp = spec['hp']-1
    saved = validate_save(native(core.checkpoint(state)))
    restored = core.restore(lua.table_from(saved, recursive=True), 12)
    if spec.get('manualRechallenge'):
        assert spec['id'] not in saved.get('fieldBosses', {})
        assert not restored.fieldSlots or restored.fieldSlots[spec['id']] is None
        core.enterStoryNode(restored, spec['node'])
        fresh = restored.fieldSlots[spec['id']]
        assert fresh.enemy.hp == spec['hp'] and fresh.cast is None and fresh.generation == 1
        if members := spec.get('members'):
            assert {e.id for e in restored.enemies.values() if e.fieldBoss == spec['id']} == {
                member['entity'] for member in members
            }
        manual.append(spec['id'])
        continue
    data = saved['fieldBosses'][spec['id']]
    assert (data['hp'], data['generation'], data['waitTicks']) == (spec['hp']-1, 1, 0)
    assert set(data.get('flags', {})) == set(spec.get('saveFlags', []))
    fresh = restored.fieldSlots[spec['id']]
    assert fresh.enemy.hp == spec['hp']-1 and fresh.cast is None and fresh.generation == 1
    core.enterStoryNode(restored, spec['node'])
    assert sum(e.fieldBoss == spec['id'] and e.id == spec['entity'] for e in restored.enemies.values()) == 1
    checked.append(spec['id'])

result = dict(controllers=len(checked), ids=checked, hpAndGenerationRoundTrip=True,
              optionalFlagsOnlyOnDeclaredControllers=True,
              reentryAttachesOnePrimary=True, manualTrialsReset=manual)
(ROOT/'evidence/field-save-contract.json').write_text(json.dumps(result, indent=2)+'\n', encoding='utf8')
print(f'{len(checked)} field-controller checkpoint round-trips and {len(manual)} manual resets passed')
