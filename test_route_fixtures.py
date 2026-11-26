"""Compare the visible route equipment to the physical gate on both sides of its unlock."""
import json
from runtime import ROOT, runtime

lua,core=runtime()
nodes={n['id']: n for n in json.loads((ROOT/'content/story-graph.json').read_text('utf8'))['nodes']}
fixtures={
    'barrier': ((-36,-45,66,7),(-37,-85,6,45)),
    'hoist': ((-32,-56,64,5),(-32,-5,64,5)),
    'signal': ((-32,-77,30,5),(-32,-93,5,23)),
}
seen=set()
for node in nodes.values():
    for edge in node['exits']:
        kind=edge.get('routeFixture')
        if not kind:
            continue
        seen.add(kind)
        state=core.new(12)
        core.action(state,'story_start')
        core.enterStoryNode(state,node['id'])
        actor=state.actors[state.active]
        actor.x,actor.y=edge['x'],edge.get('y',480)
        state.camera=max(0,min(actor.x-480,node['width']-960))
        rule=edge['requires']
        for count,level,opened in [(0,200,False),(rule['count'],max(1,nodes[edge['to']]['level']-1),nodes[edge['to']]['level']==1),(rule['count'],200,True)]:
            state.story.quests[rule['quest']]=lua.table(status='active',count=count)
            state.progression.level=level
            for packed in (False,True):
                state.packRectArt=packed
                frame=core.frame(state,'rect','h32c16')
                portal=frame.storyNearbyPortal
                assert portal and portal.to==edge['to'] and bool(portal.available)==opened,(kind,count,level)
                rects={(d.x-actor.x+state.camera,d.y-actor.y,d.w,d.h)
                       for d in frame.draws.values() if d.kind=='rect'}
                assert fixtures[kind][opened] in rects and fixtures[kind][not opened] not in rects
        print(node['id'],kind,'passed')
assert seen==set(fixtures)
