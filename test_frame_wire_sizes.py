"""Compare the same solo frame as legacy JSON, compact JSON and its actual HTTP gzip body."""
import json
from gzip import decompress
from urllib.request import Request, urlopen
from uuid import uuid4
from runtime import ROOT
from server import SESSIONS
from test_coop_local import lab

def enter_orchard(env):
    lua,core,state=env['lua'],env['core'],env['state']
    core.action(state,'story_start')
    state.story.quests['amber-join']=lua.table_from({'status':'complete','count':4,'cycles':1})
    state.story.visited['mond-road']=True
    core.action(state,'story_accept:mond-return-box-quest')
    actor=state.actors[1]
    actor.x=340
    core.action(state,'story_collect')
    actor.x=758
    core.action(state,'story_nearby_portal')
    assert state.story.node=='mond-library-orchard'
    actor.x=600
    for _ in range(2):
        core.step(state,1/60,lua.table())


def run():
    rows=[]
    with lab() as url:
        owner=uuid4().hex
        sid=revision=None
        def request(encoding='gzip', **extra):
            nonlocal sid,revision
            payload=dict(session=sid,owner=owner,steps=0,storyGraphRevision=revision,packRectArt=True) | extra
            req=Request(url+'/api/frame',json.dumps(payload).encode(),{'Content-Type':'application/json','Origin':url,'Accept-Encoding':encoding})
            with urlopen(req,timeout=30) as resp:
                wire=resp.read()
                assert len(wire)==int(resp.headers['Content-Length'])
                coding=resp.headers.get('Content-Encoding')
                if coding=='gzip':
                    assert 'Accept-Encoding' in resp.headers['Vary']
                data=decompress(wire) if coding=='gzip' else wire
            frame=json.loads(data)
            assert data==json.dumps(frame,ensure_ascii=False,separators=(',',':')).encode()
            sid,revision=frame['session'],frame['storyGraphRevision']
            return frame,coding,len(wire),len(data)
        for scene,source in [('running','traveler-run-right'),('return_box','return-box'),('oceanid','oceanid')]:
            if scene=='running':
                request(actions=['campaign'])
                request(input={'right':True},steps=1)
            elif scene=='return_box':
                request(reset=True)
                enter_orchard(SESSIONS[sid])
                request()
            else:
                request(reset=True,actions=['campaign','boss_oceanid'])
            request()
            for profile in ('sprite','legacy','h48c32','h32c16'):
                options={'render':'sprite' if profile=='sprite' else 'rect','profile':'legacy' if profile=='sprite' else profile}
                frame,coding,size,compact=request(**options)
                assert coding=='gzip' and 'storyGraph' not in frame
                if profile=='sprite':
                    assert any(source in d.get('source','') for d in frame['draws']), (scene,[d.get('source') for d in frame['draws'] if d.get('source')],frame.get('story',{}).get('node'))
                reference,plain,_,_=request('gzip;q=0',**options)
                assert plain is None
                for key in ('draws','rectBatches','commands'):
                    assert frame.get(key)==reference.get(key),(scene,profile,key)
                legacy=len(json.dumps(frame,ensure_ascii=False).encode())
                rows.append(dict(scene=scene,profile=profile,legacyBytes=legacy,jsonBytes=compact,wireBytes=size))
    (ROOT/'evidence/frame-wire-sizes.json').write_text(json.dumps(rows,indent=2)+'\n',encoding='utf8')
    print(rows)

if __name__=='__main__':
    run()
