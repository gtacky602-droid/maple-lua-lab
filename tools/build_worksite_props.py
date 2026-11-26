"""Export the small quest props using the same Lua drawing code as the field."""
import json
from pathlib import Path
import sys
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from runtime import LuaRuntime, native

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

def forest_rooms(lua,quest):
    forest=lua.execute((ROOT/'story-forest.lua').read_text('utf8'))(lua.table())
    rooms={}
    notes=[]
    for index,room in enumerate(quest['forest']['rooms']):
        data=lua.table_from(room,recursive=True)
        stages={'search':native(forest.arrangement(data,True,False))}
        if index==0:
            stages['entry']=native(forest.arrangement(data,False,False))
        rooms[room['node']]=stages
        notes.append(dict(node=room['node'],kind=room['kind'],x=forest.revealX(data)))
    offsets=[forest.offset(beat) for beat in range(forest.beats)]
    return dict(motifs=dict(sorted(native(forest.motifs).items())),rooms=rooms,offsets=offsets,notes=notes)

def lantern_contest(lua,quest,nodes):
    contest=lua.execute((ROOT/'story-contest.lua').read_text('utf8'))(lua.table())
    spec=quest['contest']
    cave=next(n for n in nodes if n['id']==quest['target'])
    gate=next(e for e in cave['exits'] if e['to']==spec['cape'])
    stages=[]
    for phase,label in [(1,'化け術の外殻'),(2,'水面に並ぶ三つの影'),(3,'残りの化け力')]:
        placements=[]
        contest.arrange(lua.table_from(spec,recursive=True),phase,spec['bossX'],gate['x'],
                        lambda key,x,y,k: placements.append([key,x,y,k]))
        assert placements[0][0]=='curtain'
        if stages:
            assert curtain==placements[0]
        curtain=placements.pop(0)
        stages.append(dict(label=label,focusX=spec['bossX'],placements=placements))
    return dict(node=cave['id'],motifs=dict(sorted(native(contest.motifs).items())),curtain=curtain,stages=stages)

def festival_courses(lua,graph):
    node=next(n for n in graph['nodes'] if n.get('ittoGames'))
    spec=node['ittoGames']
    context=lua.table()
    context.ittoGameArt=lua.table_from({k:k for k in ('flag','target','blue','orange')})
    def stamp(layer,key,x,y,height,*_):
        commands=layer.draws
        commands[len(commands)+1]=lua.table_from(dict(kind='prop',key=key,x=x,y=y,height=height))
    context.drawFieldDisplayArt=stamp
    games=lua.execute((ROOT/'story-itto-games.lua').read_text('utf8'))(context,None)
    relay=spec['relay']
    rounds=[('旗集め',dict(flags={})),
            ('訓練的',dict(targets=[dict(spot,hp=spec['targetHp']) for spot in spec['targets']])),
            ('子どもの応援競走',dict(own=dict(x=relay['startX'],points=0),
                                   other=dict(x=relay['startX'],points=0)))]
    stages=[]
    for index,(label,state) in enumerate(rounds,1):
        layer=lua.table_from(dict(draws=[]),recursive=True)
        games.drawCourse(layer,lua.table_from(spec,recursive=True),
                         lua.table_from(dict(state,index=index),recursive=True),0,'sprite','legacy')
        stages.append(dict(label=label,course=native(layer.draws)))
    return dict(node=node['id'],stages=stages)


def tea_stages(lua,quest):
    keys=('paper','tracks','day','dusk','keeper','cart','cup')
    files={key:(f'ina-tea-case-{key}-sprites-v1.json' if key!='cup'
                else 'nod-lantern-patrol-tea-sprites-v1.json') for key in keys}
    art={key:dict(key=key,box=json.loads((ROOT/'assets'/file).read_bytes())['box'])
         for key,file in files.items()}
    context=lua.table()
    context.teaCaseArt=lua.table_from(art,recursive=True)
    tea=lua.execute((ROOT/'story-tea-case.lua').read_text('utf8'))(context,lambda *_:False)
    stages={}
    q=lua.table_from(quest,recursive=True)
    for i,step in enumerate(quest['itinerary'],1):
        if not (step.get('teaClue') or step.get('teaCup') or step['kind']=='teaEvidence'):
            continue
        camera=step['x']-480
        props=[]
        def stamp(layer,sprite,x,y,height,*_):
            props.append(dict(key=sprite.key,x=x+camera,y=y,height=height))
        context.drawFieldDisplayArt=stamp
        state=lua.table_from(dict(status='active',count=i-1))
        sim=lua.table_from(dict(story=dict(node=step['node']),camera=camera,t=0,
                                active=1,actors=[{}],teaEvidence={}),recursive=True)
        tea.observe(sim,lua.table(),lua.table(),q,state,'sprite','legacy')
        assert props
        stages[str(i)]=props
    return dict(files=files,stages=stages)


def build():
    lua=LuaRuntime(unpack_returned_tuples=True)
    graph=json.loads((ROOT/'content/story-graph.json').read_bytes())
    props={}
    for q in graph['quests']:
        kind=q['kind']
        if q.get('rail'):
            rail=lua.execute((ROOT/'story-rail.lua').read_text('utf8'))
            latch,switch=lua.table(),lua.table()
            rail.drawLatch(latch,480,0)
            rail.drawSwitch(switch,480,0,True,False)
            props[q['id']]={item['id']:[relative(r,480,0) for r in rectangles(draws)]
                            for item,draws in [(q['rail']['release'],latch),(q['rail']['dispatch'],switch)]}
            continue
        if q.get('book'):
            book=lua.execute((ROOT/'story-book.lua').read_text('utf8'))
            stand=q['book']['stand']
            sim=dict(story={'node':q['hub'],'quests':{}},active=1,actors=[{'hp':1,'x':0,'y':0}],camera=stand['x'])
            draws=lua.table()
            book.observe(lua.table_from(sim,recursive=True),lua.table(),draws,lua.table_from(q,recursive=True),
                         lua.table_from(dict(status='complete',count=q['goal']),recursive=True))
            props[q['id']]={'read-stand':[relative(r,0,stand['y']) for r in rectangles(draws)]}
            continue
        if kind=='sights':
            sights=lua.execute((ROOT/'story-sights.lua').read_text('utf8'))(lua.table())
            art={}
            for place in [*q[kind]['places'],q[kind]['bridge']]:
                draws=lua.table()
                sights.drawLandmark(draws,place['id'],0,0)
                art[place['id']]=rectangles(draws)
                assert art[place['id']]
            props[q['id']]=art
            continue
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
        if kind=='construction':
            spec=q[kind]
            for key,item,count in [(spec['desk']['id'],spec['desk'],3),('work-clearing',spec['plans'][0]['site'],4),
                                   ('work-supplies',spec['plans'][0]['site'],5)]:
                draws=lua.table()
                module.drawSite(draws,0,0,lua.table_from(item),count)
                art[key]=rectangles(draws)
        if kind=='cooking':
            for flavor in q[kind]['flavors']:
                draws=lua.table()
                module.drawBanner(draws,0,0,lua.table_from(flavor))
                art['banner-'+flavor['id']]=rectangles(draws)
        if kind=='stone':
            for item in (q[kind]['mural'],q[kind]['model']):
                draws=lua.table()
                module.drawSite(draws,lua.table_from(item),0,0,False)
                art[item['id']]=rectangles(draws)
        props[q['id']]=art
    quest=next(q for q in graph['quests'] if q['kind']=='construction')
    forest_quest=next(q for q in graph['quests'] if q.get('forest'))
    contest_quest=next(q for q in graph['quests'] if q.get('contest'))
    return dict(worksites=props,haul=haul_routes(lua,quest),forest=forest_rooms(lua,forest_quest),
                contest=lantern_contest(lua,contest_quest,graph['nodes']),festival=festival_courses(lua,graph),
                teahouse=tea_stages(lua,next(q for q in graph['quests'] if q.get('teaCase'))))

if __name__=='__main__':
    output=ROOT/'content/worksite-props.json'
    output.write_text(json.dumps(build(),ensure_ascii=False,separators=(',',':'))+'\n','utf8')
