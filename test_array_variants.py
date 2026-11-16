import json
from runtime import runtime,ROOT
lua,c=runtime();checks=[]
for index in range(1,5):
 s=c.new(16);c.action(s,'boss_array_'+str(index));b=s.array;b.hp=560;c.step(s,1/60,lua.table())
 assert b.markedIndex==index and len(b.parts)==4
 assert sum(bool(e.marked) for e in b.parts.values())==1
 assert all(e.invulnerable==(i!=index) for i,e in b.parts.items())
 checks.append(f'{index}: exactly selected sentinel vulnerable')
 other=1 if index!=1 else 2;b.parts[other].hp=0;c.step(s,1/60,lua.table());assert b.phase=='split';checks.append(f'{index}: other death cannot release core')
 b.parts[index].hp=0;c.step(s,1/60,lua.table());assert b.phase=='down' and len(b.parts)==0 and len(s.enemies)==1;checks.append(f'{index}: selected death releases core')
s=c.new(16);c.action(s,'boss_array_5');assert s.array is None;checks.append('invalid selection not launched')
(ROOT/'evidence/array-variants-test.json').write_text(json.dumps({'checks':checks,'count':len(checks)},indent=2),encoding='utf8');print(len(checks),'variant checks passed')
