"""Check Lisa's map locations against the authored population and an actual kill at each."""
import json

from runtime import ROOT, native, runtime
from savegame import validate_save

def read(file):
    return json.loads((ROOT / file).read_text('utf8'))

quest = 'daily-mond-slimes'
graph = read('content/story-graph.json')
placements = read('content/enemy-spawns.json')['nodes']
config = read('content/daily-quests.json')
rules = next(q for q in config['quests'] if q['id'] == quest)
region = config['regions'][rules['region']]
lua, core = runtime()
s = core.new(12)
core.action(s, 'story_start')
core.dailyBind(s, '63ce4d909d4345a1a88da923562bba30', 20800, None)

def card(entries):
    return next(entry for entry in entries.values() if entry.id == quest)

def target_list(entry):
    return list(entry.targetNodes.values())

offered = target_list(card(core.frame(s).daily.dailyChoices))
expected = {}
level_by_node = {}
probe = core.new(12)
core.action(probe, 'story_start')
for node in graph['nodes']:
    id = node['id']
    if (node['region'] not in region['includeRegions'] or id in region['excludeNodes']
            or node.get('peaceful') or node.get('hub') or not core.atlasNodeVisible(s,id)):
        continue
    for spawn in placements.get(id, []):
        name = spawn.get('name')
        # Named proxies can share a sprite with a different species.
        is_slime = 'スライム' in name if name else spawn['art'] in rules['filter']['art']
        if is_slime and not spawn.get('dailyExclude'):
            core.enterStoryNode(probe,id)
            if not any(e.spawnId == spawn['id'] for e in probe.enemies.values()):
                continue
            expected[id] = spawn['id']
            level_by_node[id] = node['level']
            break
assert offered == sorted(expected, key=lambda id: (level_by_node[id], id))
assert 'sites-hunt-7210-pocket-1' not in offered
core.action(s,'daily_accept:'+quest)
for count,id in enumerate(offered,1):
    core.enterStoryNode(s,id)
    enemy = next((e for e in s.enemies.values() if e.spawnId == expected[id]), None)
    assert enemy is not None, (id, expected[id], [e.spawnId for e in s.enemies.values()])
    assert core.defeatEnemy(s,enemy,1)
    assert card(s.daily.ledger.activeSlots).count == count
save = validate_save(native(core.checkpoint(s)))
s = core.restore(lua.table_from(save,recursive=True))
assert target_list(card(core.frame(s).daily.activeSlots)) == offered
# The orchard's slimes exist only after the chase and before the orchard is cleared.
orchard = 'mond-library-orchard'
assert orchard not in offered
state = lua.table_from({'status':'active','count':5},recursive=True)
s.story.quests['mond-return-box-quest'] = state
assert orchard in target_list(card(core.frame(s).daily.activeSlots))
core.enterStoryNode(s,orchard)
assert any(e.spawnId=='mond-return-slime-a' for e in s.enemies.values())
state.count=6
assert orchard not in target_list(card(core.frame(s).daily.activeSlots))
report = {'quest':quest, 'locations':offered, 'defeatsCounted':len(offered),
          'excludedElite':'sites-hunt-7210-pocket-1', 'sameLocationsAfterRestore':True, 'orchardOnlyDuringQuestPhase':True}
(ROOT/'evidence/mond-slime-locations.json').write_text(json.dumps(report,indent=2)+'\n','utf8')
print(f'{len(offered)} visible locations, one qualifying kill at each and a restored journal verified.')
