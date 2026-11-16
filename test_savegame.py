import json
from runtime import runtime, native, ROOT
from savegame import validate_save
lua,c=runtime()
s=c.new(16);c.action(s,'campaign');c.action(s,'accept')
checks=[]
def check(name,ok):
    assert ok,name
    checks.append(name)
for quest,count in [('available',0),('hunt',4),('boss',8),('report',8),('complete',8)]:
    s.campaign.quest=quest;s.campaign.count=count;s.mora=1234;s.progression.questRewarded=(quest=='complete')
    saved=validate_save(native(c.checkpoint(s)))
    # A fresh Lua runtime demonstrates that no in-memory session is required.
    newlua,newcore=runtime();loaded=newcore.restore(newlua.table_from(saved,recursive=True),16)
    check('round trip '+quest,native(newcore.checkpoint(loaded))==saved and loaded.campaign.zone=='town')
    newcore.action(loaded,'report');newcore.action(loaded,'report')
    check('reward invariant '+quest,loaded.mora==1234+(200 if quest=='report' else 0))
    again=newcore.restore(newlua.table_from(validate_save(native(newcore.checkpoint(loaded))),recursive=True),16)
    newcore.action(again,'report')
    check('reward cannot repeat after reload '+quest,again.mora==loaded.mora)
for key,value in [('version',2),('mora',-1),('count',3),('gauge',101),('active',0),('kills',True),('quest','unknown')]:
    bad=saved.copy();bad[key]=value
    try: validate_save(bad)
    except ValueError: checks.append('reject '+key)
    else: raise AssertionError('accepted invalid '+key)
check('baseline has no checkpoint',c.checkpoint(c.new(16)) is None)
(ROOT/'evidence/savegame-test.json').write_text(json.dumps({'checks':checks,'count':len(checks)},ensure_ascii=False,indent=2),encoding='utf8')
print(len(checks),'save checks passed')
