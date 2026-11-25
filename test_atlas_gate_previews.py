"""Check the physical gate advertised by each local M-map route against the authored scene."""
import json
from experience import LEVELS
from runtime import ROOT, runtime

graph = json.loads((ROOT/'content/story-graph.json').read_bytes())
nodes = {n['id']:n for n in graph['nodes']}
lua,core = runtime()
state = core.new(12)
core.action(state,'story_start')
# Keep this structural fixture separate from the earned-save route test.
def view(key):
    core.action(state,'world_map_close')
    core.enterStoryNode(state,key)
    core.action(state,'world_map_toggle')
    try:
        return core.frame(state,'sprite','legacy').worldMap
    except Exception as exc:
        raise RuntimeError(f'{key}: {str(exc).splitlines()[0]}') from exc

def physical(node):
    return {(e['to'],e['x'],e.get('y',480)) for e in node['exits'] if isinstance(e.get('x'),(int,float))
            and e['to']!=node.get('voyage',{}).get('destination')}

connections = {key:set() for key in nodes}
def gates(node,atlas):
    result = set()
    transfers = 0
    for route in atlas.routes.values():
        connections[node['id']].add(route.id)
        if route.previewX is None:
            assert route.automaticArrival or route.label in ('戦闘中に帰還','戦闘中に移動'),(node['id'],route.id)
            transfers+=1
        else:
            key = (route.id,route.previewX,route.previewY or 480)
            assert key in physical(node) and key not in result,(node['id'],key)
            result.add(key)
    return result,transfers

road = nodes['mond-road']
fresh,_ = gates(road,view(road['id']))
assert not any(key[0]=='golden-hub' for key in fresh) and ('anemo-approach',1200,480) in fresh
hidden = [n['id'] for n in nodes.values() if not core.atlasNodeVisible(state,n['id'])]
assert 'sum-wanderer-hollow' in hidden and 'golden-hub' in hidden
core.grantExp(state,LEVELS[-1]['maple_reference_total_exp_to_reach'],'quest')
quest_defs = {q['id']:q for q in graph['quests']}
def complete(quest):
    state.story.quests[quest] = lua.table(status='complete',count=quest_defs[quest]['goal'],cycles=1)
    if quest=='sum-kaveh-model':
        spec=quest_defs[quest]['readingModel']
        state.story.quests[quest].roomLayout=lua.table_from(dict(station=spec['start'],shelf='wall',seat='view',
            window='outward',visited={station['id']:True for station in spec['stations']}),recursive=True)

split_quest = 'fon-morte-sluice-survey'
for n in nodes.values():
    state.story.visited[n['id']]=True
    if n.get('hiddenGroup'):
        state.story.discovered[n['hiddenGroup']]=True
    rules = [n['revealAfter']] if n.get('revealAfter') else []
    rules.extend(e['requires'] for e in n['exits'] if e.get('hideUntilAllowed') and e.get('requires'))
    for rule in rules:
        if rule['quest'] != split_quest:
            complete(rule['quest'])

regional = {}
seen = {}
automatic = 0
for key,n in nodes.items():
    atlas = view(key)
    assert atlas and atlas.selected.id==key,key
    seen[key],count = gates(n,atlas)
    automatic+=count
alternate = {n['id'] for n in nodes.values() if any(e.get('hideUntilAllowed') and
             e.get('requires',{}).get('quest')==split_quest for e in n['exits'])}
complete(split_quest)
for key in alternate:
    extra,_ = gates(nodes[key],view(key))
    seen[key].update(extra)

for key,n in nodes.items():
    expected = physical(n)
    assert seen[key]==expected,(key,expected-seen[key])
    counts = regional.setdefault(n['region'],dict(stages=0,gates=0))
    counts['stages']+=1
    counts['gates']+=len(seen[key])
totals=dict(stages=len(nodes),physicalGates=sum(map(len,seen.values())),automaticOrBattleRoutes=automatic)
def reachable(edges):
    reached={'mond-town'}
    stack=list(reached)
    while stack:
        new=edges[stack.pop()]-reached
        reached.update(new)
        stack.extend(new)
    return reached

reverse={key:set() for key in nodes}
for key,routes in connections.items():
    for dest in routes:
        reverse[dest].add(key)
assert reachable(connections)==reachable(reverse)==nodes.keys()
totals['reachableFromMondstadt']=len(reachable(connections))
totals['canReturnToMondstadt']=len(reachable(reverse))
report=dict(scope='M-map structural fixtures: initial visibility, all discoveries, and both sluice survey states',
            totals=totals,regions=regional,hiddenInFreshState=len(hidden),surveyAlternateNodes=sorted(alternate))
(ROOT/'evidence/atlas-gate-previews.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n','utf8')
print(totals)
