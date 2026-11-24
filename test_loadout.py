import json
from runtime import runtime,native,ROOT
from savegame import validate_save
lua,c=runtime();checks=[]
def check(name,value):
 assert value,name
 checks.append(name)
def slots(seq): return lua.table_from([seq]+[[] for _ in range(7)],recursive=True)
def tick(s,n):
 for _ in range(n): c.step(s,1/60,lua.table())
s=c.new(12)
check('editing outside town rejected',not c.configure(s,slots(['SK01']))[0])
c.action(s,'campaign')
for seq in [['SK01']*4,['SK61'],['slot1']]:
 check('invalid sequence rejected '+str(seq),not c.configure(s,slots(seq))[0])
check('three skills accepted',c.configure(s,slots(['SK01','SK01','SK02']))[0])
c.action(s,'field');s.actors[2].hp=0
c.action(s,'slot1');tick(s,1)
def casts(s): return [v for _,v in s.events.items() if str(v.kind).startswith('cast:') and v.actor==1]
check('macro starts one cast',len(casts(s))==1)
c.action(s,'slot1');tick(s,110)
check('repeated activation cannot bypass CT',len(casts(s))==1)
tick(s,80);ev=casts(s)
check('ordered casts respect CT and lock',len(ev)==3 and ev[1].t-ev[0].t>=1.99 and ev[2].t-ev[1].t>=.64)
check('sequence terminates',s.macro is None)
tick(s,300);check('no automatic loop',len(casts(s))==3)
c.action(s,'slot1');tick(s,1)
check('first step executes before dodge',len(casts(s))==4)
c.action(s,'dodge')
check('dodge clears remaining steps',s.macro is None)
tick(s,160);check('dodged macro does not resume after cooldown',len(casts(s))==4)
c.action(s,'slot1');c.action(s,'cancel_macro');check('explicit cancel',s.macro is None)
c.action(s,'slot1');s.actors[2].hp=140;c.action(s,'swap');check('swap cancels queued skills',s.macro is None)
c.action(s,'slot1');check('companion cannot use traveler slots',s.macro is None)
c.action(s,'town');saved=validate_save(native(c.checkpoint(s)))
restored=c.restore(lua.table_from(saved,recursive=True),12)
check('loadout persisted in checkpoint',native(c.checkpoint(restored))['loadout']==saved['loadout'])
legacy=saved.copy();legacy.pop('loadout');restored=c.restore(lua.table_from(validate_save(legacy),recursive=True),12)
check('old saves get defaults',native(c.checkpoint(restored))['loadout'][0]==['SK01'])
(ROOT/'evidence/loadout-test.json').write_text(json.dumps({'count':len(checks),'checks':checks},ensure_ascii=False,indent=2),encoding='utf8')
print(len(checks),'loadout checks passed')
