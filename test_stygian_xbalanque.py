"""Exercise Xbalanque's fixed card timings, composite ownership, and save lifecycle."""
import json

from experience import LEVELS
from runtime import ROOT, native, runtime
from savegame import validate_save

lua,core=runtime()
hub,court='natlan-hub','natlan-solar-court'
quest='stygian-xbalanque-commission'
spec=json.loads((ROOT/'content/stygian-matches.json').read_text(encoding='utf8'))['matches']['xbalanque']
manifest=json.loads((ROOT/'docs/stygian-motion-v1/MANIFEST.json').read_text(encoding='utf8'))
cards={m['id']:m for m in manifest['entries'] if m['boss']=='xbalanque'}
advance=lua.eval('function(C,s,n,input) for i=1,n do C.step(s,1/60,input) end end')


def place(a,x,y=480):
    a.x,a.y,a.vy,a.ground=x,y,0,True


def step(s,n,**keys):
    advance(core,s,n,lua.table(**keys))


def ready(level=112):
    s=core.new(12)
    core.action(s,'story_start')
    core.grantExp(s,LEVELS[level-1]['maple_reference_total_exp_to_reach'],'quest')
    core.enterStoryNode(s,hub)
    return s


def begin(level=112,mode='normal'):
    s=ready(level)
    core.action(s,'story_accept:'+quest)
    place(s.actors[1],648)
    core.action(s,'story_nearby_portal')
    assert s.story.node==court
    core.action(s,'stygian_start:xbalanque:'+mode+':troupe')
    s.actors[2].hp=0
    run=s.endgameRun
    return s,run,run.boss,s.actors[1]


def until(s,condition,limit=12000):
    for _ in range(limit+1):
        if condition():
            return
        step(s,1)
    r=s.endgameRun
    raise AssertionError((r.status,r.stage,r.phase,r.cast and r.cast.key))


def at_card(s,run,key,variant=None):
    until(s,lambda:run.cast is not None and run.cast.key==key and run.cast.variant==variant)
    return run.cast


def events(s,tag,cast=None):
    return [e for e in s.events.values() if e.kind=='stygian:xbalanque:'+tag and (cast is None or e.cast==cast)]


def cast(s,b,power=100000):
    hit=lua.table(id=1,key='normal',x=b.x-45,y=b.y,dir=1,range=125,limit=1,mult=1,
                  element='physical',color='#fff3e2',gain=0,atk=power,playerInputAt=s.t,startedAt=s.t)
    core.resolveCast(s,hit)


def frame(s,mode='sprite',profile='legacy'):
    return core.frame(s,mode,profile)


for key,m in cards.items():
    row=spec['moves'][key]
    assert row['title']==m['title'] and row['total']==m['total_ticks']
    assert row['locks']==m['lock_ticks'] and row['windows']==[v[:2] for v in m['active_windows']]
    assert row['recovery']==m['recovery'][0]
    if key=='XB07':
        for variant in ['A','B','C']:
            route=row['variants'][variant]
            entry=m if variant=='A' else next(x for x in m['variants'] if x['name']==variant)
            windows=[]
            locks=[]
            for child in route['children']:
                windows+= [[v+child['at'] for v in w] for w in spec['moves'][child['key']]['windows']]
                locks+= [v+child['at'] for v in spec['moves'][child['key']]['locks']]
            assert windows==[v[:2] for v in entry['active_windows']] and locks==entry['lock_ticks']
            assert route['total']==entry['total_ticks'] and route['recovery']==entry['recovery'][0]
            assert route['children'][1]['at']==spec['moves'][route['children'][0]['key']]['total']

for mode in spec['modes']:
    unready=ready(mode['level']-1)
    core.enterStoryNode(unready,court)
    core.action(unready,'stygian_start:xbalanque:'+mode['id']+':troupe')
    assert unready.endgameRun is None
    s,run,b,a=begin(mode['level'],mode['id'])
    assert run.rules.limit is None and b.hp==mode['hp'] and b.level==mode['level']

s,run,b,a=begin()
a.inv=99999
initial=frame(s)
assert any(d.source=='xbalanque-idle-left-source-v1.png' and d.h==84 for d in initial.draws.values())
cast(s,b)
assert b.hp==b.maxhp
first=at_card(s,run,'XB01')
place(a,b.x-77)
step(s,12)
before=first.child.dir
place(a,b.x+99)
step(s,52)
assert first.child.dir==before and [e.tick for e in events(s,'XB01:window')]==[36,54]
assert not events(s,'XB01:contact')
second=at_card(s,run,'XB02')
step(s,99)
assert [e.tick for e in events(s,'XB02:window')]==[42,66,90]
third=at_card(s,run,'XB03')
place(a,b.x-155)
a.inv=0
hp=a.hp
step(s,119)
assert [e.tick for e in events(s,'XB03:launch',third.serial)]==[48,72,96]
assert [e.group for e in events(s,'XB03:contact',third.serial)]==[1,2,3]
assert a.hp<hp
a.inv=99999
cast(s,b)
assert run.pendingStage==2 and b.hp==1157
until(s,lambda:run.phase=='phase')
assert run.stage==2 and not run.cast

fourth=at_card(s,run,'XB04')
place(a,b.x-170)
a.inv=0
hp=a.hp
step(s,119)
assert a.hp<hp and len(events(s,'XB04:contact',fourth.serial))==1
assert events(s,'XB04:window',fourth.serial)[0].tick==78
a.inv=99999
fifth=at_card(s,run,'XB05')
place(a,b.x-200)
step(s,18)
landing=fifth.child.landing
place(a,landing)
step(s,51)
assert abs(b.y-(480-1.7*88))<1e-5 and not events(s,'XB05:contact')
step(s,14)
assert fifth.t==83 and b.y<480 and not events(s,'XB05:window')
step(s,1)
assert b.x==landing and b.y==480 and events(s,'XB05:contact',fifth.serial)[0].tick==84
cast(s,b)
assert b.hp==534 and run.pendingStage==3
until(s,lambda:run.phase=='phase')

sixth=at_card(s,run,'XB06')
place(a,500)
step(s,102)
assert [e.tick for e in events(s,'XB06:window',sixth.serial)]==[90]
final=at_card(s,run,'XB08')
place(a,b.x-110)
step(s,60)
locked=final.child.landing
place(a,480)
step(s,98)
assert final.child.landing==locked and len(final.child.shots)==0
band=frame(s).endgameRun
assert abs((band.safe.right-band.safe.left)/88-1.6)<1e-6 and band.beat==2
assert band.safe.inLane
place(a,band.safe.left+2)
assert not frame(s).endgameRun.safe.inLane
place(a,480)
step(s,154)
assert final.t==312 and not any(e.group in (2,3) for e in events(s,'XB08:contact',final.serial))
assert not len(final.child.shots)
step(s,18)
direction=final.child.dir
place(a,b.x-direction*90)
step(s,90)
assert final.t==420 and direction==final.child.dir and final.total-final.t==180
assert len(events(s,'XB08:lock',final.serial))==2
assert [e.tick for e in events(s,'XB08:window',final.serial)]==[144,228,300,390]
assert frame(s).endgameRun.phase=='recover'
assert events(s,'XB07:A')==[] and events(s,'XB07:B')==[] and events(s,'XB07:C')==[]

last=final.serial
intervening=[]
while True:
    step(s,1)
    current=run.cast
    if current and current.serial!=last:
        last=current.serial
        if current.key=='XB08':
            break
        intervening.append(current.key)
    assert len(intervening)<7
assert [x for x in intervening if x!='XB07']==['XB01','XB04','XB02']

# Check all parents through the actual scheduler and each child's own recovery.
for variant in ['A','B','C']:
    c=at_card(s,run,'XB07',variant)
    route=spec['moves']['XB07']['variants'][variant]
    assert c.total==route['total'] and c.t==0
    user=frame(s).endgameRun
    assert user.variant==variant and user.child==route['children'][0]['key']
    start_two=route['children'][1]['at']
    step(s,start_two-1)
    assert frame(s).endgameRun.phase=='recover' and c.child.offset==0
    step(s,1)
    assert c.childIndex==2 and c.child.offset==start_two and c.child.t==0
    assert c.child.key==route['children'][1]['key']
    step(s,c.total-start_two)
    assert not run.cast
    logged=[]
    for child in route['children']:
        logged.extend(e.tick for e in events(s,child['key']+':window',c.serial))
    entry=cards['XB07'] if variant=='A' else next(x for x in cards['XB07']['variants'] if x['name']==variant)
    assert logged==[w[0] for w in entry['active_windows']]

# A late finish remains valid and clears a launched child projectile immediately.
run.start=s.t-370
combo=at_card(s,run,'XB07','B')
step(s,206)
assert run.status=='fighting' and len(combo.child.shots)==1 and frame(s).endgameRun.remaining is None
cast(s,b)
assert run.cast is None and b.hp==0
step(s,1)
assert run.status=='clear' and run.reward.mora==2530 and run.reward.first
assert s.endgame.stygian['xbalanque:normal'].bestTicks>370*60
assert s.story.quests[quest].count==1
step(s,120)
winner=frame(s)
assert winner.endgameRun.phase=='bow' and winner.boss.y==480
assert any(d.source and d.source.startswith('xbalanque-idle-') and d.h==84 for d in winner.draws.values())
core.action(s,'endgame_exit')
core.enterStoryNode(s,hub)
core.action(s,'story_report:'+quest)
saved=validate_save(native(core.checkpoint(s)))
restored=core.restore(lua.table_from(saved,recursive=True))
assert restored.story.quests[quest].status=='complete'
assert restored.endgame.stygian['xbalanque:normal'].clears==1

s=ready(123)
s.mora=520000
assert core.giveArtifact(s,2,85,4)
core.action(s,'artifact_equip:1')
core.action(s,'artifact_upgrade:1')
assert core.giveArtifact(s,1,84,4)
core.action(s,'artifact_equip:2')
fixture=validate_save(native(core.checkpoint(s)))
(ROOT/'work/stygian-xbalanque-gear.json').write_text(json.dumps(fixture,ensure_ascii=False),encoding='utf8')
proof={'cards':list(cards),'rank_levels':[m['level'] for m in spec['modes']],
       'locked_direction':True,'ground_beam_single_contact':True,'three_fireballs':True,
       'jump_root_height_px':1.7*88,'landing_only_contact_tick':84,
       'parent_card_lengths':{'A':318,'B':456,'C':420},'child_recoveries_and_exact_offsets':True,
       'first_solo_before_chain':True,'finale_windows':[144,228,300,390],
       'central_safe_width_U':1.6,'lane_indicator_requires_body_clearance':True,
       'finale_recovery':180,'three_ordinary_cards_between_finales':True,
       'no_limit_late_record_restores':True,'clear_cancels_live_child_projectile':True,'standing_end_pose_84px':True}
(ROOT/'evidence/stygian-xbalanque-lua.json').write_text(json.dumps(proof,indent=2)+'\n',encoding='utf8')
print('Xbalanque Lua: eight cards, three parent patterns, landing, centre route, deadline-free clear and save passed')
