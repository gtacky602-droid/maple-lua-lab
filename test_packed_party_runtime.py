"""Compare production Lua draw calls with the original authored pose in every facing."""
import json
from runtime import ROOT, runtime

lua, core = runtime()
assets = ROOT / 'assets'
items = json.loads((ROOT/'content/character-art-gallery.json').read_bytes())['items']
check = lua.execute("""
local function same(a,b)
 if type(a)~='table' then return a==b end
 if type(b)~='table' then return false end
 for k,v in pairs(a) do if not same(v,b[k]) then return false end end
 for k in pairs(b) do if a[k]==nil then return false end end
 return true
end
return function(draw,owner,key,original,mode,profile,batch)
 local function frame()
  local f={draws={}}
  if batch then f.rectIndex={};f.rectBatches={} end
  draw(f,mode,profile)
  return {draws=f.draws,rectBatches=f.rectBatches}
 end
 local packed=owner[key]
 local actual=frame()
 owner[key]=original
 local expected=frame()
 owner[key]=packed
 assert(#actual.draws>0 and same(actual,expected),'draw command mismatch')
end
""")
actor=lua.table(x=470,y=480)
state=lua.table(camera=35)
def original(name):
    return lua.table_from(json.loads((assets/name).read_bytes()),recursive=True)

# Starting a Lua world and painting a PNG should not allocate any rectangle rows.
traveler=core.travelerIdleArt.right
has_runs=lua.eval("function(g) return rawget(g,'runs')~=nil end")
assert not has_runs(traveler.profiles.legacy)
core.drawTravelerIdleArt(lua.table(draws=lua.table()),state,lua.table(x=470,y=480,dir=1),'sprite','legacy')
assert not has_runs(traveler.profiles.legacy)
core.drawTravelerIdleArt(lua.table(draws=lua.table()),state,lua.table(x=470,y=480,dir=1),'rect','h32c16')
assert has_runs(traveler.profiles.h32c16) and not has_runs(traveler.profiles.legacy)

checks=0
for item in items:
    key=item['id']
    art=original(item['file'])
    left=original(item['leftFile']) if item.get('leftFile') else None
    art.height=item['height']
    art.left=left
    for side,dir_ in [('left',-1),('right',1)]:
        actor.dir=dir_
        if key=='traveler':
            owner,slot,reference=core.travelerIdleArt,side,left if side=='left' else art
            def draw(f,m,p): core.drawTravelerIdleArt(f,state,actor,m,p)
        elif key=='amber':
            owner,slot,reference=core,'amberIdleArt',art
            def draw(f,m,p): core.drawAmberArt(f,state,actor,m,p,core.amberIdleArt)
        else:
            owner,slot,reference=core.companionArt,key,art
            def draw(f,m,p): core.drawCompanionArt(f,state,actor,m,p,key)
        for profile in ('legacy','h48c32','h32c16'):
            for mode,batch in [('sprite',False),('rect',False),('rect',True)]:
                check(draw,owner,slot,reference,mode,profile,batch)
                checks+=1
print(f'{checks} Lua draw outputs match original poses for {len(items)} entries, both facings and three profiles.')
