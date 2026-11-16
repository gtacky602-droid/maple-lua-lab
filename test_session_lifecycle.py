import json, threading, urllib.request, urllib.error, time
from pathlib import Path
import server

http=server.ThreadingHTTPServer(('127.0.0.1',0),server.Handler)
thread=threading.Thread(target=http.serve_forever,daemon=True);thread.start()
base=f'http://127.0.0.1:{http.server_port}'
def post(path,data,origin=None):
    headers={'Content-Type':'application/json','Origin':origin or base}
    req=urllib.request.Request(base+path,json.dumps(data).encode(),headers)
    try:
        with urllib.request.urlopen(req) as r:return r.status,json.loads(r.read() or b'null')
    except urllib.error.HTTPError as e:return e.code,json.loads(e.read()) if e.code==400 else None
def frame(**kw):return post('/api/frame',{'steps':0,**kw})
try:
    code,a=frame(owner='a',resume=True,actions=['story_start','story_accept:mond-patrol']);assert code==200
    sid=a['session'];assert a['story']['quests']['mond-patrol']['status']=='active'
    assert post('/api/release',{'session':sid,'owner':'a'})[0]==204
    # An already in-flight old document frame must not cancel retirement.
    assert frame(session=sid,owner='a')[0]==200
    assert 'retire_at' in server.SESSIONS[sid]
    code,b=frame(session=sid,owner='b',resume=True);assert code==200 and b['session']==sid
    assert b['story']['quests']==a['story']['quests'] and 'retire_at' not in server.SESSIONS[sid]
    post('/api/release',{'session':sid,'owner':'a'});assert 'retire_at' not in server.SESSIONS[sid]
    assert frame(session=sid,owner='a')[0]==400
    code,duplicate=frame(session=sid,owner='c',resume=True);assert code==200 and duplicate['session']!=sid
    assert server.SESSIONS[sid]['owner']=='b'
    while len(server.SESSIONS)<12:assert frame(owner=f'owner-{len(server.SESSIONS)}',resume=True)[0]==200
    assert frame(owner='extra',resume=True)[0]==400
    victim=duplicate['session'];post('/api/release',{'session':victim,'owner':'c'})
    assert frame(owner='extra',resume=True)[0]==400  # Grace preserves reload opportunity.
    server.SESSIONS[victim]['retire_at']=time.monotonic()-1
    assert frame(owner='extra',resume=True)[0]==200
    assert victim not in server.SESSIONS and sid in server.SESSIONS
    assert post('/api/release',{'session':sid,'owner':'b'},'https://example.com')[0]==403
    assert 'retire_at' not in server.SESSIONS[sid]
    Path('evidence/session-lifecycle-test.json').write_text(json.dumps({'reloadPreservesQuest':True,'inflightDoesNotCancelRelease':True,'oldReleaseIgnoredAfterResume':True,'staleFrameRejected':True,'activeDuplicateIsolated':True,'limit':12,'graceSeconds':60,'expiredReleaseFreesSlot':True,'otherSessionsPreserved':True,'foreignOriginRejected':True},indent=2)+'\n')
    print('Session grace, reload, duplicate, late requests, cap and origin checks passed')
finally:http.shutdown();http.server_close()
