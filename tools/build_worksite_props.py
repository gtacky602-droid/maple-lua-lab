"""Export the small quest props using the same Lua drawing code as the field."""
import json
from pathlib import Path
import sys
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from runtime import LuaRuntime

def rectangles(draws):
    runs=[]
    for rect in draws.values():
        assert rect.kind=='rect'
        runs.append([rect.x,rect.y,rect.w,rect.h,rect.color])
    return runs

def relative(rect,x,y):
    return [rect[0]-x,rect[1]-y,*rect[2:]]

def haul_routes(lua,quest):
    rail=lua.execute((ROOT/'story-rail.lua').read_text('utf8'))
    context=lua.execute((ROOT/'story-construction.lua').read_text('utf8'))(rail.drawCart)
    cart_draws=lua.table()
    rail.drawCart(cart_draws,0,0)
    cart=rectangles(cart_draws)
    routes={}
    for plan in quest['construction']['plans']:
        stops=((1,'港を出た荷車'),(4,'荷車道の中ほど'),(7.5,'狩場へ向かう荷車')) if plan['id']=='ground' else (
              (0,'荷台に積み込む'),(.5,'荷車を吊り上げる'),(4,'上段の荷下ろし場'))
        samples=[]
        frames=[]
        for time,label in stops:
            sim=dict(t=time,camera=0,story={'node':plan['route']},active=1,actors=[{'hp':1,'x':0,'y':480}])
            state=dict(status='complete',count=quest['goal'],construction={'plan':plan['id']})
            draws,frame=lua.table(),lua.table()
            context.observe(lua.table_from(sim,recursive=True),frame,draws,lua.table_from(quest,recursive=True),lua.table_from(state,recursive=True))
            x,y=frame.storyHaulCart.x,frame.storyHaulCart.y
            commands=rectangles(draws)
            assert [relative(r,x,y) for r in commands[-len(cart):]]==cart
            frames.append(commands[:-len(cart)])
            samples.append(dict(label=label,time=time,x=x,y=y))
        fixed,deck=[],[]
        for parts in zip(*frames,strict=True):
            if all(r==parts[0] for r in parts):
                fixed.append(parts[0])
            else:
                local=[relative(r,s['x'],s['y']) for r,s in zip(parts,samples)]
                assert all(r==local[0] for r in local)
                deck.append(local[0])
        routes[plan['route']]=dict(fixed=fixed,deck=deck,stops=samples)
    return dict(cart=cart,routes=routes)

def build():
    lua=LuaRuntime(unpack_returned_tuples=True)
    graph=json.loads((ROOT/'content/story-graph.json').read_bytes())
    props={}
    for q in graph['quests']:
        kind=q['kind']
        if kind not in ('construction','cooking','stone'):
            continue
        module=lua.execute((ROOT/f'story-{kind}.lua').read_text('utf8'))
        if kind=='construction':
            module=module(None)
        sites_key,flags_key={'cooking':('ingredients','gathered'),'stone':('marks','marked'),
                             'construction':('surveys','surveyed')}[kind]
        sites=q[kind][sites_key]
        art={}
        for item in sites:
            state=dict(status='active',count=0)
            state[kind]={flags_key:{p['id']:True for p in sites if p!=item}}
            sim=dict(story={'node':item['node'],'quests':{}},actors=[{'hp':1,'x':-999,'y':0}],active=1,camera=item['x'],t=0)
            draws=lua.table()
            module.observe(lua.table_from(sim,recursive=True),lua.table(),draws,lua.table_from(q,recursive=True),
                           lua.table_from(state,recursive=True))
            runs=[relative(rect,0,item['y']) for rect in rectangles(draws)]
            assert runs
            art[item['id']]=runs
        props[q['id']]=art
    quest=next(q for q in graph['quests'] if q['kind']=='construction')
    return dict(worksites=props,haul=haul_routes(lua,quest))

if __name__=='__main__':
    output=ROOT/'content/worksite-props.json'
    output.write_text(json.dumps(build(),ensure_ascii=False,separators=(',',':'))+'\n','utf8')
