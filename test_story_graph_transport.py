"""HTTP graph revisions, full-client compatibility, and repeated-frame transport benchmark."""

from collections import defaultdict
import json
import statistics
import threading
import time
from urllib.request import Request, urlopen

from experience import LEVELS
from runtime import ROOT
from server import Handler, LabServer, LOCK, SESSIONS


def write(path, value):
    (ROOT/path).write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n',encoding='utf8')


def has_node(frame, id):
    return any(n['id']==id for n in frame['storyGraph']['nodes'])


def has_quest(frame, id):
    return any(q['id']==id for q in frame['storyGraph']['quests'])


def has_edge(frame, from_id, to_id):
    site=next(n for n in frame['storyGraph']['nodes'] if n['id']==from_id)
    return any(e['to']==to_id for e in site['exits'])


http=LabServer(('127.0.0.1',0),Handler,daily_path=':memory:')
thread=threading.Thread(target=http.serve_forever,daemon=True)
thread.start()
url=f'http://127.0.0.1:{http.server_port}/api/frame'
requestor='story-graph-test'


def frame(**fields):
    params={'steps':0,'render':'sprite','owner':requestor,**fields}
    request=Request(url,json.dumps(params).encode(),{'Content-Type':'application/json'})
    start=time.perf_counter()
    with urlopen(request,timeout=20) as response:
        body=response.read()
    elapsed=(time.perf_counter()-start)*1000
    return json.loads(body),len(body),elapsed


def same_payload(full, compact):
    ignore=('storyGraph','storyGraphRevision','lua_ms','lua_kb')
    assert {k:v for k,v in full.items() if k not in ignore}=={
        k:v for k,v in compact.items() if k not in ignore}


def measure(session, revision):
    samples=defaultdict(list)
    for _ in range(12):
        full,full_bytes,full_ms=frame(session=session)
        compact,compact_bytes,compact_ms=frame(session=session,storyGraphRevision=revision)
        same_payload(full,compact)
        assert compact['draws']==full['draws'] and compact['commands']==full['commands']
        assert 'storyGraph' not in compact and 'storyGraphRevision' not in full
        assert compact['storyGraphRevision']==revision
        samples['legacy_bytes'].append(full_bytes)
        samples['compact_bytes'].append(compact_bytes)
        samples['legacy_median_http_ms'].append(full_ms)
        samples['compact_median_http_ms'].append(compact_ms)
        samples['median_lua_ms'].append(compact['lua_ms'])
    stats={key:round(statistics.median(rows),2) for key,rows in samples.items()}
    stats.update(visible=compact['visible'],population=compact['total'],
                 draw_commands=compact['commands'],samples_per_mode=12)
    stats['reduction_pct']=round(100*(1-stats['compact_bytes']/stats['legacy_bytes']),2)
    assert stats['reduction_pct']>90
    return stats


try:
    initial,_,_=frame(actions=['story_start'],storyGraphRevision=None)
    rev=initial['storyGraphRevision']
    sid=initial['session']
    assert not has_node(initial,'golden-hub') and not has_quest(initial,'golden-explore')
    assert not has_quest(initial,'wanderer-join')
    legacy,_,_=frame(session=sid)
    assert initial['storyGraph']==legacy['storyGraph']
    assert initial['storyGraph']['nodes']
    town=measure(sid,rev)
    # Normal progress changes stay in the fast frame path while the definitions remain cached.
    accepted,_,_=frame(session=sid,storyGraphRevision=rev,actions=['story_accept:mond-patrol'])
    assert accepted['story']['quests']['mond-patrol']['status']=='active' and 'storyGraph' not in accepted
    with LOCK:
        env=SESSIONS[sid]
        lua,core,state=env['lua'],env['core'],env['state']
        core.grantExp(state,LEVELS[34]['maple_reference_total_exp_to_reach'],'quest')
        core.enterStoryNode(state,'mond-road')
        state.actors[state.active].x=1105
    discovery,_,_=frame(session=sid,storyGraphRevision=rev,actions=['story_collect'])
    fresh=discovery['storyGraphRevision']
    assert fresh!=rev and discovery['story']['discovered']['golden']
    assert has_node(discovery,'golden-hub') and has_quest(discovery,'golden-explore')
    assert not has_edge(discovery,'mond-road','golden-hub')
    resent,_,_=frame(session=sid,storyGraphRevision=rev)
    assert resent['storyGraph']==discovery['storyGraph'] and resent['storyGraphRevision']==fresh
    with LOCK:
        core.enterStoryNode(state,'golden-hub')
    visited,_,_=frame(session=sid,storyGraphRevision=fresh)
    assert has_edge(visited,'mond-road','golden-hub') and visited['storyGraphRevision']!=fresh
    with LOCK:
        core.enterStoryNode(state,'sites-gaa-03')
    hunt=measure(sid,visited['storyGraphRevision'])
    assert hunt['population']==48
    saved_view,_,_=frame(session=sid,storyGraphRevision=visited['storyGraphRevision'],checkpoint=True)
    assert 'storyGraph' not in saved_view
    save=saved_view['checkpoint']
    # Exercise visibility predicates with controlled progression and an old quest record.
    with LOCK:
        state.story.discovered.simulanka=True
        core.enterStoryNode(state,'simulanka-book-room')
        state.story.quests['simulanka-open-page']=lua.table_from({'status':'active','count':1})
        state.story.quests['sum-wanderer-observation']=lua.table_from({'status':'active','count':4})
    locked,_,_=frame(session=sid,storyGraphRevision=visited['storyGraphRevision'])
    assert not has_edge(locked,'simulanka-book-room','simulanka-hub')
    assert not has_node(locked,'sum-wanderer-hollow')
    with LOCK:
        state.story.quests['simulanka-open-page'].count=2
    unlocked_edge,_,_=frame(session=sid,storyGraphRevision=locked['storyGraphRevision'])
    assert unlocked_edge['storyGraphRevision']!=locked['storyGraphRevision']
    assert has_edge(unlocked_edge,'simulanka-book-room','simulanka-hub')
    assert not has_node(unlocked_edge,'sum-wanderer-hollow')
    with LOCK:
        state.story.quests['sum-wanderer-observation'].count=5
    unlocked_node,_,_=frame(session=sid,storyGraphRevision=unlocked_edge['storyGraphRevision'])
    assert unlocked_node['storyGraphRevision']!=unlocked_edge['storyGraphRevision']
    assert has_node(unlocked_node,'sum-wanderer-hollow') and not has_quest(unlocked_node,'wanderer-join')
    with LOCK:
        state.story.quests['wanderer-join']=lua.table_from({'status':'complete','count':1})
    open_graph,_,_=frame(session=sid,storyGraphRevision=unlocked_node['storyGraphRevision'])
    latest=open_graph['storyGraphRevision']
    assert latest!=unlocked_node['storyGraphRevision'] and has_quest(open_graph,'wanderer-join')
    legacy,_,_=frame(session=sid)
    assert open_graph['storyGraph']==legacy['storyGraph']
    reloaded,_,_=frame(session=sid,storyGraphRevision=None,resume=True)
    assert reloaded['session']==sid and reloaded['storyGraphRevision']==latest
    assert reloaded['storyGraph']==open_graph['storyGraph']
    reset,_,_=frame(session=sid,storyGraphRevision=latest,reset=True,actions=['story_start'])
    assert reset['session']!=sid and reset['storyGraphRevision']!=latest
    assert not has_node(reset,'golden-hub') and not has_quest(reset,'wanderer-join')

    # A genuine saved adventure carries its discovery through a distinct runtime.
    restored,_,_=frame(session=reset['session'],storyGraphRevision=reset['storyGraphRevision'],restore=save)
    assert restored['session']!=reset['session'] and has_node(restored,'golden-hub')
    assert not has_node(restored,'simulanka-hub')
    result={'mondstadt':town,'golden_island_hunt':hunt,'full_and_compact_same_draws':True,
            'legacy_http_contract':True,'ordinary_quest_progress_kept_compact':True,
            'discovery_and_first_visit':True,'quest_gated_edge_and_node':True,'legacy_quest_membership':True,
            'retry_reload_reset_restore':True}
    write('evidence/story-graph-transport.json',result)
    print(json.dumps(result,ensure_ascii=False))
finally:
    http.shutdown()
    http.server_close()
