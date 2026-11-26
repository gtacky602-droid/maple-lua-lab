"""Export the Lua room devices at their initial state for the quest atlas."""
import json
from pathlib import Path
from lupa import LuaRuntime

root=Path(__file__).resolve().parents[1]
lua=LuaRuntime(unpack_returned_tuples=True)
can_inspect=lua.eval('function(a,p) return math.abs(a.x-p.x)<54 and math.abs(a.y-p.y)<34 end')
def module(name):
    return lua.execute((root/('story-'+name+'.lua')).read_text(encoding='utf8'))(can_inspect)
resonance,rocks,paper=map(module,['resonance','rock-views','paper-folds'])
graph=json.loads((root/'content/story-graph.json').read_text(encoding='utf8'))
targets={s['node'] for q in graph['quests'] for s in q.get('itinerary',[])
         if s.get('resonanceOrder') or s.get('paperFold') or s.get('shadowChoice')}
rooms=[room for room in graph['nodes'] if room['id'] in targets or room.get('rockViews')]
rooms_art={}
for room in rooms:
    config=room.get('rockViews') or room.get('paperBoard') or room.get('resonance')
    if not config or not ('points' in config or 'panels' in config or config.get('order')): continue
    scene=lua.table_from(config,recursive=True)
    items=config.get('points') or config.get('panels') or [config['panel'],*config['stones']]
    exported=[]
    for p in items:
        x,y=p['x'],p['y']
        camera=x-480
        state=lua.table_from({'active':1,'actors':[{'x':x,'y':y}],'camera':camera},recursive=True)
        draws,frame=lua.table(),lua.table()
        if 'points' in config: rocks.observe(state,frame,draws,scene,None)
        elif 'panels' in config: paper.observe(state,frame,draws,scene,None,False)
        else: resonance.observe(state,frame,draws,scene,None,None)
        rows=[]
        for d in draws.values():
            dx,dy=d.x-480,d.y-y
            if not -80<=dx<=80: continue
            if 'panels' in config and d.kind=='rect' and d.color=='#fff3c7': continue
            rows.append([dx,dy,d.w,d.h,d.color] if d.kind=='rect' else [dx,dy,d.text,d.size,d.color])
        entry={'rows':rows}
        if frame.storyRockView:
            v=frame.storyRockView
            entry['view']={'id':v.id,'name':v.name,'line':v.line,'rocks':[
                {'left':r.left,'right':r.right,'height':r.height,'color':r.color,**({'shape':r.shape} if r.shape else {})} for r in v.rocks.values()]}
        assert rows
        exported.append(entry)
    rooms_art[room['id']]=exported
(root/'content/quest-puzzle-stations.json').write_text(json.dumps(rooms_art,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf8')
