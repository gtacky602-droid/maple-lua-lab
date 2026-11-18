"""Exercise daily dispatch through actual Lua deaths and the frame server."""
from copy import deepcopy
from datetime import datetime, timezone
import json
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Thread
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from daily_store import DAILY_QUESTS, period_at
from runtime import ROOT, native, runtime
from savegame import validate_save
from server import Handler, LOCK, LabServer, SESSIONS


main,slimes,elites,rest,cave=('daily-mond-'+name for name in ('safety','slimes','elites','rest','cave'))
profile='63ce4d909d4345a1a88da923562bba30'
day=20800
lua,core=runtime()


def begin():
    state=core.new(12)
    core.action(state,'story_start')
    core.dailyBind(state,profile,day,None)
    return state


def act(s,command,quest):
    core.action(s,'daily_'+command+':'+quest)


def slots(s,field='activeSlots'):
    return {r['id']:r for r in native(s.daily.ledger[field])} if len(s.daily.ledger[field]) else {}


def authored(s,node,spawn,actor=1):
    core.enterStoryNode(s,node)
    enemy=next(e for e in s.enemies.values() if e.spawnId==spawn)
    assert core.defeatEnemy(s,enemy,actor)
    return enemy


def valid(s):
    return validate_save(native(core.checkpoint(s)))


s=begin()
authored(s,'mond-road','mond-road-2')
assert not slots(s)
core.enterStoryNode(s,'mond-town')
act(s,'accept',main)
assert 'ひと回り' in core.frame(s).daily.notice
act(s,'accept',slimes)
act(s,'accept',cave)
act(s,'accept',rest)
act(s,'accept',elites)
assert set(slots(s))=={main,slimes,rest}
e=authored(s,'mond-road','mond-road-2',2)
assert [slots(s)[q]['count'] for q in (main,slimes,rest)]==[1,1,1]
assert not core.defeatEnemy(s,e,2)
core.onKill(s,e)
assert [slots(s)[q]['count'] for q in (main,slimes,rest)]==[1,1,1]
authored(s,'liyue-entry','liyue-entry-1')
assert [slots(s)[q]['count'] for q in (main,slimes,rest)]==[1,1,1]
core.enterStoryNode(s,'natlan-iansan-training')
fake=lua.table_from(dict(id=-7,spawnId='mond-road-2',hp=1,noRewards=True,x=200,y=480,level=100))
assert core.defeatEnemy(s,fake,1)
assert [slots(s)[q]['count'] for q in (main,slimes,rest)]==[1,1,1]

# Finish the 200/60/80 authoring targets using ordinary registered enemies.
for _ in range(59):
    authored(s,'mond-road','mond-road-2')
for _ in range(20):
    authored(s,'mond-road','mond-road-1')
for _ in range(120):
    authored(s,'mond-border','mond-border-3')
assert [slots(s)[q]['count'] for q in (main,slimes,rest)]==[200,60,80]
act(s,'claim',main)
assert not slots(s)[main]['claimed']
core.enterStoryNode(s,'mond-town')
ready=valid(s)
act(s,'claim',main)
act(s,'claim',main)
core.dailySettle(s)
core.dailySettle(s)
assert s.daily.paidXp==640 and s.daily.paidMora==480
assert not core.frame(s).daily.activeSlots[1].canClaim
earned=valid(s)
core.dailyBind(s,profile,day+1,None)
assert not slots(s) and set(slots(s,'carrySlots'))=={slimes,rest}
act(s,'carry',slimes)
act(s,'carry',slimes)
core.dailySettle(s)
assert s.daily.paidXp==870 and set(slots(s,'carrySlots'))=={rest}
act(s,'accept',main)
assert core.frame(s).daily.notice=='アンバー「今日もよろしく。」'
authored(s,'mond-road','mond-road-1')
assert slots(s)[main]['count']==1
core.dailyBind(s,profile,day+2,None)
assert not slots(s) and not slots(s,'carrySlots') and s.daily.paidXp==870

# The elite and cave alternatives can also be finished on authored fields.
s=begin()
act(s,'accept',elites)
e=authored(s,'mond-border','mond-border-daily-elite')
assert slots(s)[elites]['count']==1
core.step(s,1/60,lua.table())
advance=lua.eval('function(C,s,n) for i=1,n do C.step(s,1/60,{}) end end')
advance(core,s,370)
assert e.hp>0 and core.defeatEnemy(s,e,1)
authored(s,'mond-old-ground','mond-old-ground-daily-elite')
assert slots(s)[elites]['count']==3
core.enterStoryNode(s,'mond-town')
act(s,'claim',elites)
core.dailySettle(s)
assert s.daily.paidXp==280
core.enterStoryNode(s,'mond-bennett-depth')
core.enterStoryNode(s,'mond-town')
s.story.quests['mond-bennett-cave']=lua.table_from({'status':'complete','count':5})
act(s,'accept',cave)
assert cave in slots(s)
for _ in range(60):
    authored(s,'mond-bennett-depth','mond-bennett-depth-slime')
assert slots(s)[cave]['count']==60
core.enterStoryNode(s,'mond-town')
act(s,'claim',cave)
core.dailySettle(s)
assert s.daily.paidXp==540

# Reconnecting sessions share one authoritative entitlement, even with an older save.
def request(server, **data):
    url=f'http://127.0.0.1:{server.server_port}/api/frame'
    body=json.dumps({'steps':0,'density':12,**data}).encode('utf8')
    with urlopen(Request(url,data=body,headers={'Content-Type':'application/json'}),timeout=30) as response:
        return json.load(response)


def lab(path,provider):
    server=LabServer(('127.0.0.1',0),Handler,daily_path=path,daily_period=provider)
    worker=Thread(target=server.serve_forever,daemon=True)
    worker.start()
    return server,worker


def close(server, worker):
    server.shutdown()
    worker.join()
    server.server_close()
    with LOCK:
        SESSIONS.clear()


with TemporaryDirectory() as tmp:
    database=Path(tmp)/'daily.sqlite3'
    active_day=[day]
    server,worker=lab(database,lambda:active_day[0])
    try:
        future=deepcopy(ready)
        future['daily']['ledger']['period']=day+1
        try:
            request(server,restore=future)
        except HTTPError as error:
            assert error.code==400
        else:
            raise AssertionError('future save established the server period')
        original=request(server,restore=ready,checkpoint=True)
        first_id=original['session']
        claimed=request(server,session=first_id,actions=['daily_claim:'+main]*2,checkpoint=True)
        result=validate_save(claimed['checkpoint'])
        assert result['progression']['questXp']-ready['progression']['questXp']==640
        assert result['mora']-ready['mora']==480
        stale=request(server,restore=ready,actions=['daily_claim:'+main],checkpoint=True)['checkpoint']
        assert stale['mora']==result['mora'] and stale['progression']['questXp']==result['progression']['questXp']
        assert stale['daily']['ledger']['earnedXp']==640
        same=request(server,restore=result,actions=['daily_claim:'+main],checkpoint=True)['checkpoint']
        assert same['mora']==result['mora']
    finally:
        close(server,worker)
    active_day[0]+=1
    server,worker=lab(database,lambda:active_day[0])
    try:
        result=request(server,restore=ready,checkpoint=True,actions=['daily_carry:'+slimes]*2)['checkpoint']
        assert result['daily']['ledger']['period']==day+1
        assert result['daily']['ledger']['earnedXp']==870
        assert result['mora']==ready['mora']+480+195
        assert {row['id'] for row in result['daily']['ledger']['carrySlots']}=={rest}
        stale=request(server,restore=ready,checkpoint=True,actions=['daily_carry:'+slimes])['checkpoint']
        assert stale['mora']==result['mora']
    finally:
        close(server,worker)

reset=datetime(2026,11,20,19,tzinfo=timezone.utc).timestamp()
assert period_at(reset-1)+1==period_at(reset)==period_at(reset+1)
bad=deepcopy(earned)
bad['daily']['ledger']['activeSlots'].append(dict(id=elites,count=3,claimed=True))
try:
    validate_save(bad)
except ValueError:
    pass
else:
    raise AssertionError('invalid daily slot set passed')

(ROOT/'work/daily-mond-ready-fixture.json').write_text(json.dumps(ready,ensure_ascii=False)+'\n',encoding='utf8')
proof=dict(goalsCompleted={q['designId']:q['goal'] for q in DAILY_QUESTS.values() if q['region']=='mondstadt'},
           companionAndOverlaps=True,oneEventOncePerSlot=True,trainingAndWrongRegionExcluded=True,
           sameDayOneMainTwoExtra=True,rolloverAndGrace=True,serverPeriodBoundary=True,
           staleSaveAndRestart=True,legacyCompatible=True,rewardAppliedOnce=True)
(ROOT/'evidence/daily-mond-lua-http.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print('All five Mondstadt goals, three slots, day reset, restart and stale save passed')
