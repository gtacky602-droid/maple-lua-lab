"""Traverse the six passenger routes with Lua input and timed automatic arrivals."""

import json
from math import ceil

from experience import LEVELS
from runtime import ROOT, native, runtime
from savegame import validate_save
from tools.waypoint_test import TrailWalk


def read(path):
    return json.loads((ROOT/path).read_text(encoding='utf8'))


def write(path,value):
    (ROOT/path).write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n',encoding='utf8')


nodes={n['id']:n for n in read('content/story-graph.json')['nodes']}
exits={id:n['exits'] for id,n in nodes.items()}
gates={(a,e['to']):e for a,rows in exits.items() for e in rows}
routes=read('sources/map-research/sites-return-ferries.json')['routes']
plan=read('design/world/atlas-route-plan.json')['sites_only_route_review']
lua,core=runtime()
batch=lua.eval('function(C,s,n) for _=1,n do C.step(s,1/60,{}) end end')
sailings=set()
crossings=set()


def new(level,id):
    state=core.new(12)
    core.action(state,'story_start')
    core.grantExp(state,LEVELS[level-1]['maple_reference_total_exp_to_reach'],'quest')
    core.enterStoryNode(state,id)
    return state,TrailWalk(lua,core,state,gates,exits)


def checkpoint(s):
    return validate_save(native(core.checkpoint(s)))


def load_save(s):
    return core.restore(lua.table_from(checkpoint(s),recursive=True),12)


def path(walk,steps,*,test_clock=False):
    s=walk.state
    for a,b in zip(steps,steps[1:]):
        assert s.story.node==a
        for actor in s.actors.values():
            actor.inv=1000
        v=s.voyage
        if v and v.destination==b:
            payload=core.frame(s)
            assert payload.voyage.kind=='ferry' and payload.voyage.destinationName==nodes[b]['name']
            assert not payload.voyage.stopover or v.stopStart
            remaining=v.arrives-s.t
            if test_clock:
                first=payload.voyage.scroll
                batch(core,s,60)
                current=core.frame(s).voyage.scroll
                assert (current<first) if v.reverse else (current>first)
                remaining=v.arrives-s.t
            batch(core,s,max(0,ceil(remaining*60)-2))
            assert s.story.node==a
            batch(core,s,3)
            assert s.story.node==b and not s.voyage
            assert (walk.actor.x,walk.actor.y)==(v.arrivalX,v.arrivalY)
            sailings.add(a)
        else:
            walk.cross(b)
        crossings.add((a,b))


for route in routes:
    out,back=route['paths']['forward'],route['paths']['return']
    entry=next(row for row in plan if set(row['fields'])==set(route['fields']))
    assert entry['finding']=='implemented_as_lab_route'
    assert list(entry['runtime_paths'].values()) in ([out,back],[back,out])
    level=max(nodes[id]['level'] for id in out+back)
    state,walk=new(level,out[0])
    quests=native(state.story.quests)
    path(walk,out,test_clock=True)
    path(walk,back,test_clock=True)
    assert state.story.node==out[0] and native(state.story.quests)==quests
assert sailings=={'liyue-ferry','liyue-ferry-return','natlan-voyage','natlan-voyage-return',
                  'chenyu-ferry-fontaine','fontaine-ferry-chenyu'}

s,w=new(120,'nod-port')
path(w,['nod-port','natlan-voyage-return'])
assert s.voyage.total==90 and load_save(s).story.node=='nod-port'
core.action(s,'story_fast:nod-port')
assert s.story.node=='natlan-voyage-return' and '着岸' in s.storyNotice
core.action(s,'world_map_toggle')
view=core.frame(s).worldMap
assert view.selected.current and any(r.id=='natlan-port' and r.label=='舟・寄港' for r in view.routes.values())
assert any(r.id=='nod-port' and r.label=='航海を中止' for r in view.routes.values())
before=s.t
batch(core,s,180)
assert s.t==before
core.action(s,'world_map_close')

gate=gates['natlan-voyage-return','ochkanatlan-dock']
w.approach(gate['x'],480,'ochkanatlan-dock')
if s.t-s.voyage.started<29.8:
    batch(core,s,int((29.8-(s.t-s.voyage.started))*60))
core.action(s,'story_nearby_portal')
assert s.story.node=='natlan-voyage-return' and s.storyNotice=='寄港時間外'
path(w,['natlan-voyage-return','ochkanatlan-dock'])
assert w.actor.x==1050 and not s.voyage
s,w=new(120,'ochkanatlan-dock')
write('work/sites-ferry-ochka-fixture.json',checkpoint(s))
path(w,['ochkanatlan-dock','natlan-voyage-return'])
assert abs(s.voyage.arrives-s.t-40)<1e-8
assert not core.frame(s).voyage.stopover and load_save(s).story.node=='ochkanatlan-dock'
path(w,['natlan-voyage-return','natlan-port'])

s,w=new(120,'nod-port')
path(w,['nod-port','natlan-voyage-return'])
batch(core,s,3000)
assert not core.frame(s).voyage.stopover
w.approach(720,480,'ochkanatlan-dock')
core.action(s,'story_nearby_portal')
assert s.story.node=='natlan-voyage-return' and s.storyNotice=='寄港時間外'
path(w,['natlan-voyage-return','natlan-port'])
assert not s.story.visited['ochkanatlan-dock']

s,w=new(40,'inazuma-port')
write('work/sites-ferry-inazuma-fixture.json',checkpoint(s))
path(w,['inazuma-port','liyue-ferry-return'])
assert load_save(s).story.node=='inazuma-port'
w.approach(900,480,'liyue-harbor')
core.action(s,'story_nearby_portal')
assert s.story.node=='liyue-ferry-return' and s.storyNotice=='到着待ち'

s,w=new(87,'liyue-wp-66769')
entry=gates['liyue-wp-66769','chenyu-ferry-fontaine']
w.approach(entry['x'],480,'chenyu-ferry-fontaine')
notice=core.frame(s).storyNearbyPortal
assert notice.level==88 and not notice.available
core.action(s,'story_nearby_portal')
assert s.story.node=='liyue-wp-66769' and s.voyage is None
s,w=new(88,'sites-lumidouce-landing')
path(w,['sites-lumidouce-landing','fontaine-ferry-chenyu'])
assert load_save(s).story.node=='sites-lumidouce-landing'

result={'optional_open_sea_level_88_and_restore':True,'reviewed_round_trips':len(routes),'directions_exercised':len(crossings),'timed_voyages':sorted(sailings),
        'return_stop_start_30_end_50':True,'can_sail_past_stop':True,'reboard_forty_seconds':True,
        'atlas_pauses_and_shows_ship_destination':True,'save_resumes_boarding_side':True,
        'premature_landing_and_warp_blocked':True}
write('evidence/sites-return-ferries-lua.json',result)
print(result)
