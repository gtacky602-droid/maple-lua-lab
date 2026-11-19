"""Verify the authored two-sword duel across the regular entrance, cast clock and save."""
import json
import math

from experience import LEVELS
from runtime import ROOT, native, runtime
from savegame import validate_save

lua, core=runtime()
hub, arena, quest='mond-town','mond-stygian-dual-court','stygian-farka-commission'
spec=json.loads((ROOT/'content/stygian-matches.json').read_text(encoding='utf8'))['matches']['farka']
entries=json.loads((ROOT/'docs/stygian-motion-v1/MANIFEST.json').read_text(encoding='utf8'))['entries']
cards={e['id']:e for e in entries if e['boss']=='farka'}
advance=lua.eval('function(C,s,n,input) for _=1,n do C.step(s,1/60,input) end end')


def step(s,n=1,**keys):
    advance(core,s,n,lua.table(**keys))


def ready(lv):
    s=core.new(12)
    core.action(s,'story_start')
    core.grantExp(s,LEVELS[lv-1]['maple_reference_total_exp_to_reach'],'quest')
    core.enterStoryNode(s,hub)
    return s


def place(a,x,y=480):
    a.x,a.y,a.vy,a.ground=x,y,0,True


def begin(mode='normal',lv=12):
    s=ready(lv)
    core.action(s,'story_accept:'+quest)
    place(s.actors[1],295)
    core.action(s,'story_nearby_portal')
    assert s.story.node==arena
    if lv==12:
        core.action(s,'stygian_start:farka:extreme:troupe')
        assert not s.endgameRun
    core.action(s,'stygian_start:farka:'+mode+':troupe')
    r=s.endgameRun
    a=s.actors[1]
    s.actors[2].hp=0
    a.inv=400
    return s,r,r.boss,a


def until(s,condition,limit=11000):
    for _ in range(limit):
        if condition(): return
        step(s)
    r=s.endgameRun
    raise AssertionError((r.status,r.stage,r.phase,r.cast and r.cast.key))


def at(s,r,key,t=0):
    until(s,lambda:r.cast and r.cast.key==key and r.cast.t==t)
    return r.cast


def events(s,tag,c=None):
    return [e for e in s.events.values() if e.kind=='stygian:farka:'+tag and (c is None or e.cast==c.serial)]


def strike(s,b,atk=100000):
    hit=lua.table(id=1,key='normal',x=b.x-42,y=b.y,dir=1,element='physical',range=120,limit=1,
                  color='#fff3e2',gain=0,atk=atk,mult=1,playerInputAt=s.t,startedAt=s.t)
    core.resolveCast(s,hit)


def check_card(s,c):
    card=cards[c.key]
    assert [e.tick for e in events(s,c.key+':lock',c)]==card['lock_ticks']
    assert [e.tick for e in events(s,c.key+':window',c)]==[w[0] for w in card['active_windows']]


s,r,b,a=begin()
until(s,lambda:r.phase=='ready')
assert b.hp==670 and not r.boss.invulnerable
strike(s,b)
assert b.hp==math.ceil(670*.65)
combo=at(s,r,'FK01')
step(s,204)
assert b.x<combo.child.x and math.isclose(combo.child.x-b.x,.4*88)
check_card(s,combo)
# The forward leap can lock onto the raised right ledge and its slash stays above the floor.
b.x=655
place(a,750,371)
leap=at(s,r,'FK02',24)
assert leap.child.floor==371 and leap.child.destination==750
place(a,798)
a.inv=0
hp=a.hp
step(s,66)
assert b.y==371 and b.x==750 and a.hp==hp and not events(s,'FK02:contact',leap)
step(s,96)
check_card(s,leap)
assert events(s,'FK02:infuse',leap)[0].tick==108
guard=at(s,r,'FK06',48)
assert b.hp>0 and not b.invulnerable and not events(s,'FK06:window',guard)
step(s,24)
until(s,lambda:r.stage==2 and r.phase=='ready')
assert r.age-r.phaseAt==90
strike(s,b)
assert b.hp==math.ceil(670*.30)
plunge=at(s,r,'FK03',30)
x=plunge.child.destination
place(a,x)
a.inv=0
hp=a.hp
step(s,54)
assert math.isclose(b.y,480-1.6*88) and a.hp==hp
place(a,x)
step(s,17)
assert a.hp==hp and not events(s,'FK03:contact',plunge)
step(s)
assert b.x==x and b.y==480 and a.hp<hp
step(s,102)
check_card(s,plunge)
assert len(events(s,'FK03:contact',plunge))==1
cross=at(s,r,'FK04')
a.inv=400
step(s,156)
check_card(s,cross)
until(s,lambda:r.stage==3 and r.phase=='ready')
assert r.age-r.phaseAt==90
b.x=618
place(a,410)
burst=at(s,r,'FK05',42)
x,dir=burst.child.destination,burst.child.dir
place(a,x+dir*63)
a.inv=0
hp=a.hp
step(s,47)
core.action(s,'jump')
step(s,16,jump=True)
assert a.y<422 and a.hp==hp
step(s,66,jump=True)
assert a.y==480 and a.hp==hp and not events(s,'FK05:contact',burst)
step(s,129)
check_card(s,burst)
strike(s,b)
assert b.hp==1 and not r.chainOpen

for variant in ('A','B'):
    parent=at(s,r,'FK07')
    assert parent.variant==variant and parent.child.key=='FK03'
    data=cards['FK07'] if variant=='A' else cards['FK07']['variants'][0]
    a.inv=400
    step(s,203)
    f=core.frame(s,'sprite','legacy').endgameRun
    assert f.child=='FK03' and f.childTick==203 and f.phase=='recover'
    step(s)
    child='FK04' if variant=='A' else 'FK05'
    assert parent.child.key==child and parent.child.t==0 and parent.child.offset==204
    step(s,data['recovery'][0]-204)
    assert parent.t==data['recovery'][0] and r.chainOpen
    assert not events(s,'FK07:window',parent)
    locks=events(s,'FK03:lock',parent)+events(s,child+':lock',parent)
    attacks=events(s,'FK03:window',parent)+events(s,child+':window',parent)
    assert [e.tick for e in locks]==data['lock_ticks']
    assert [e.tick for e in attacks]==[w[0] for w in data['active_windows']]
    step(s,data['total_ticks']-parent.t)
    assert not r.cast
    if variant=='A':
        normal=at(s,r,'FK03')
        step(s,normal.card.total_ticks)
        normal=at(s,r,'FK01')
        step(s,normal.card.total_ticks)
strike(s,b)
step(s)
assert r.status=='clear' and r.reward.mora==2400 and r.reward.first
assert s.story.quests[quest].count==1 and s.returns==0
f=core.frame(s,'sprite','legacy')
assert sum(d.source=='farka-sword-source-v1.png' for d in f.draws.values())==2
core.action(s,'endgame_exit')
core.enterStoryNode(s,hub)
core.action(s,'story_report:'+quest)
record=validate_save(native(core.checkpoint(s)))
restored=core.restore(lua.table_from(record,recursive=True))
assert restored.story.quests[quest].status=='complete'
assert restored.endgame.stygian['farka:normal'].clears==1

s,r,b,a=begin('extreme',152)
assert b.hp==5520
until(s,lambda:r.phase=='ready')
a.hp=0
step(s)
assert r.status=='failed' and not r.cast and s.returns==1

fixture=ready(12)
fixture.mora=49000
assert core.giveArtifact(fixture,2,22,3)
core.action(fixture,'artifact_equip:1')
assert core.giveArtifact(fixture,1,26,3)
core.action(fixture,'artifact_equip:2')
data=validate_save(native(core.checkpoint(fixture)))
(ROOT/'work/stygian-farka-gear.json').write_text(json.dumps(data,ensure_ascii=False),encoding='utf8')
proof={'cards':list(cards),'ranks':[m['level'] for m in spec['modes']],
       'upper_ledge_lock':True,'plunge_has_no_contact_before_landing':True,
       'single_plunge_window':True,'two_burst_sweeps_cleared_in_place':True,
       'parent_lengths':{'A':432,'B':528},'first_child_recovery_114_to_204':True,'parent_adds_no_hit':True,
       'separate_swords':True,'clear_reward_report_saved':True,'legacy_kept':True}
(ROOT/'evidence/stygian-farka-lua.json').write_text(json.dumps(proof,indent=2)+'\n',encoding='utf8')
print('Farka Lua: seven cards, elevated leap, locked plunge, low/high evade, two child routes and save passed')
