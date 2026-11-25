"""Extract the visible mechanisms from the actual Lua weekly controllers."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from runtime import native, runtime

ROOMS = ('buried-weaving-room', 'tide-calibration-hall', 'mond-gate-chess-court', 'narwhal-inner-echo')
PROFILES = ('legacy','h48c32','h32c16')


def sprite_part(entity_id, name, species, filename, d):
    art = json.loads((ROOT/'assets'/filename).read_text('utf8'))
    assert (art['source'],art['box']) == (d['source'],d['box'])
    return dict(id=entity_id,name=name,species=species,file=filename,x=d['x'],y=d['y'],
                flip=d['flip'],h=d['h'],anchorX=d['anchorX'])


def primitives(part, draws):
    part['marks'] = [dict(d, x=d['x']-part['x'],y=d['y']-part['y']) for d in draws]
    return part


def components(node,w,z,frame):
    ds=native(frame.draws)
    info=frame.weeklyBoss
    sprites=[d for d in ds if d['kind']=='boss_sprite']
    labels=[d for d in ds if d['kind']=='text' and d['y']>100]
    pads=[d for d in ds if d['kind']=='rect']
    parts=[]
    if node=='buried-weaving-room':
        body,left,right=sprites
        parts.append(sprite_part(z.id,'織機の本体','loom-body','twin-shuttle-loom-closed-sprites-v1.json',body))
        for n,(shuttle,d,label) in enumerate(zip(info.shuttles.values(),(left,right),labels,strict=True)):
            species='loom-shuttle-'+('left' if n==0 else 'right')
            part=sprite_part('boss-'+str(shuttle.id),shuttle.name,species,'twin-shuttle-loom-shuttle-sprites-v1.json',d)
            parts.append(primitives(part,[label]))
    elif node=='tide-calibration-hall':
        for i,(x,rect,label) in enumerate(zip(info.cleansePads.values(),pads,labels,strict=True)):
            key='calibration-pad-'+('left' if i==0 else 'right')
            part=dict(id=key,species=key,name=('左' if i==0 else '右')+'の解除床',x=x,y=z.floorY,
                      flip=False,h=18,box=[0,0,rect['w'],18])
            parts.append(primitives(part,[rect,label]))
        parts.append(sprite_part(z.id,'測距機構','surveyor-meter','tide-surveyor-meter-sprites-v1.json',sprites[0]))
    elif node=='mond-gate-chess-court':
        king,=info.gate.bodies.values()
        assert king.kind=='king' and len(ds)==len(pads)
        height=z.floorY-min(d['y'] for d in pads)
        width=max(d['x']+d['w'] for d in pads)-min(d['x'] for d in pads)
        part=dict(id='boss-'+str(w.king.id),species='gate-king-piece',name='駒王',x=king.x,y=z.floorY,
                  flip=False,h=height,box=[0,0,width,height])
        parts.append(primitives(part,pads))
    else:
        assert info.narwhalStage=='inner' and info.narwhal.entries==1
        parts.append(sprite_part('boss-'+str(z.entity+9),'黒い幻影','narwhal-inner-phantom',
                                 'narwhal-phantom-idle-sprites-v1.json',sprites[0]))
    return dict(parts=parts,captions=[d for d in ds if d['kind']=='text' and d['y']<=100])


def build():
    lua,core=runtime()
    steps=lua.eval('function(C,s,n) for i=1,n do C.step(s,1/60,{}) end end')
    scenes={}
    work=ROOT/'work/weekly-mechanisms';work.mkdir(exist_ok=True,parents=True)
    for node in ROOMS:
        state=core.new(12)
        core.action(state,'story_start')
        inside=node=='narwhal-inner-echo'
        core.enterStoryNode(state,'narwhal-star-sea' if inside else node)
        slot,spec=core.currentWeeklyBoss(state)
        if inside:
            # Trigger the normal swallow transition and capture the first actionable interior frame.
            slot.h,slot.queued=100,True
            steps(core,state,1+spec.moves.WV07.total)
        assert state.story.node==node
        frame=core.captureWeeklyScenery(state,'sprite','legacy')
        scenes[node]=components(node,slot,spec,frame)
        ref={}
        for quality in ('png',*PROFILES):
            mode='sprite' if quality=='png' else 'rect'
            profile='legacy' if quality=='png' else quality
            draws=native(core.captureWeeklyScenery(state,mode,profile).draws)
            # Check the entire observer stream against the ordered commands in the gameplay frame.
            combat=iter(native(core.frame(state,mode,profile).draws))
            assert all(any(d==actual for actual in combat) for d in draws),(node,quality)
            ref[quality]=draws
        (work/(node+'.json')).write_text(json.dumps(ref,separators=(',',':')),'utf8')
    return scenes


if __name__=='__main__':
    result=build()
    (ROOT/'content/weekly-opening-parts.json').write_text(json.dumps(result,ensure_ascii=False,sort_keys=True,indent=2)+'\n','utf8')
    print({n:[p['name'] for p in scene['parts']] for n,scene in result.items()})
