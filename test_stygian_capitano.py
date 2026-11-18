"""Exercise the nine fixed cards and the real Stygian lifecycle in the Lua runtime."""
import json

from experience import LEVELS
from runtime import ROOT, native, runtime
from savegame import validate_save

lua,core=runtime()
hub,arena='snezhnaya-hub','sne-stygian-frost-court'
quest='stygian-capitano-commission'
spec=json.loads((ROOT/'content/stygian-matches.json').read_text(encoding='utf8'))['matches']['capitano']
manifest=json.loads((ROOT/'docs/stygian-motion-v1/MANIFEST.json').read_text(encoding='utf8'))
advance=lua.eval('function(C,s,n,input) for i=1,n do C.step(s,1/60,input) end end')


def place(a,x,y=480):
    a.x,a.y,a.ground,a.vy=x,y,True,0


def step(s,n,**keys):
    advance(core,s,n,lua.table(**keys))


def wait(s,predicate,limit=1800,**keys):
    for i in range(limit+1):
        if predicate():
            return
        step(s,1,**keys)
    raise AssertionError((s.endgameRun.phase,s.endgameRun.stage,s.t))


def ready(level=144):
    s=core.new(12)
    core.action(s,'story_start')
    core.grantExp(s,LEVELS[level-1]['maple_reference_total_exp_to_reach'],'quest')
    core.enterStoryNode(s,hub)
    return s


def start(level=144,mode='normal'):
    s=ready(level)
    core.action(s,'story_accept:'+quest)
    place(s.actors[1],650)
    core.action(s,'story_nearby_portal')
    assert s.story.node==arena
    core.action(s,'stygian_start:capitano:'+mode+':troupe')
    s.actors[2].hp=0
    return s,s.endgameRun,s.endgameRun.boss,s.actors[1]


def fixture_cast(s,b,power=100000):
    cast=lua.table(id=1,key='normal',x=b.x-54,y=480,dir=1,range=125,limit=1,element='physical',
                   color='#fff3eb',gain=0,mult=1,atk=power,playerInputAt=s.t,startedAt=s.t)
    core.resolveCast(s,cast)


def log(s,tag):
    return [e for e in s.events.values() if e.kind=='stygian:capitano:'+tag]


def card(s,run,key):
    wait(s,lambda:run.cast is not None and run.cast.key==key)
    return run.cast


def compare_frame(s,profile='legacy',mode='sprite'):
    return core.frame(s,mode,profile)


def to_p2(s,run,b,a):
    a.inv=100
    place(a,b.x-129)
    card(s,run,'CP01')
    fixture_cast(s,b)
    assert b.hp==1580 and run.pendingStage==2
    wait(s,lambda:run.phase=='phase')
    assert run.stage==2 and not run.cast
    return card(s,run,'CP05')

for row in manifest['entries']:
    if row['boss']=='capitano':
        move=spec['moves'][row['id']]
        assert move['title']==row['title']
        assert (move['total'],move['lock'],move['recovery'])==(row['total_ticks'],row['lock_ticks'][0],row['recovery'][0])
        assert move['windows']==[w[:2] for w in row['active_windows']]

for rule in spec['modes']:
    s=ready(rule['level']-1)
    core.enterStoryNode(s,arena)
    core.action(s,'stygian_start:capitano:'+rule['id']+':troupe')
    assert s.endgameRun is None
    s,run,b,a=start(rule['level'],rule['id'])
    assert b.hp==rule['hp'] and b.level==rule['level'] and run.rules.limit==rule['limit']

s,run,b,a=start()
a.inv=100
place(a,b.x-113)
step(s,59)
assert compare_frame(s).endgameRun.coat
assert any(d.source=='capitano-coat-left-source-v1.png' for d in compare_frame(s).draws.values())
fixture_cast(s,b)
assert b.hp==b.maxhp
step(s,1)
assert not compare_frame(s).endgameRun.coat and len(log(s,'coat-off'))==1
assert any(d.source=='capitano-ice-sword-source-v1.png' and d.rotation for d in compare_frame(s).draws.values())
step(s,60)
assert run.cast.key=='CP01' and run.cast.t==0
step(s,60)
assert [e.tick for e in log(s,'CP01:window')]==[36,54]
c=card(s,run,'CP02')
place(a,b.x-107)
step(s,24)
direction=c.dir
place(a,b.x+100)
step(s,105)
assert c.dir==direction and [e.tick for e in log(s,'CP02:window')]==[51,75,123]
assert not any(e.actor==1 for e in log(s,'CP02:contact'))

c=card(s,run,'CP03')
step(s,24)
origin,landing=c.origin,c.land
assert abs(landing-origin)<=3*88
place(a,(origin+landing)/2)
hp=a.hp
step(s,56)
assert c.t==80 and (min(origin,landing)<=b.x<=max(origin,landing)) and a.hp==hp
assert not log(s,'CP03:window') and not log(s,'CP03:contact')
step(s,1)
assert abs(b.x-landing)<1e-6 and log(s,'CP03:window')[-1].tick==81

c=card(s,run,'CP04')
step(s,24)
place(a,b.x-c.dir*110)
step(s,50)
assert log(s,'CP04:window')[-1].tick==66 and not log(s,'CP04:contact')

s,run,b,a=start()
c=to_p2(s,run,b,a)
place(a,b.x-145)
step(s,49)
a.inv=0
hp=a.hp
core.action(s,'jump')
step(s,72,jump=True)
assert a.hp==hp and not log(s,'CP05:contact')
step(s,24)
assert len(c.shots)==0 and log(s,'CP05:window')[-1].tick==54

c=card(s,run,'CP06')
step(s,30)
pillars=sorted((z.left,z.right) for z in c.shapes.values())
assert all(lo1-hi0>=1.2*88-1e-6 for (_,hi0),(lo1,_) in zip(pillars,pillars[1:]))
safe=(pillars[0][1]+pillars[1][0])/2
place(a,safe)
step(s,90)
assert [e.tick for e in log(s,'CP06:window')]==[72,90,108]
assert not log(s,'CP06:contact')

c=card(s,run,'CP07')
step(s,30)
place(a,c.boardX-c.dir*34)
a.inv=0
hp=a.hp
step(s,36)
step(s,19,**{'right' if c.dir==1 else 'left':True})
assert (a.x-c.boardX)*c.dir>12 and a.hp==hp
place(a,c.boardX-c.dir*34)
step(s,15)
assert c.t==100 and compare_frame(s).endgameRun.plate
assert (not s.solids or len(s.solids)==0) and len(c.shots)==0 and a.hp==hp
step(s,2)
assert len(c.shots)==4 and not compare_frame(s).endgameRun.plate
assert a.hp==hp and not log(s,'CP07:contact')
step(s,36)
assert len(c.shots)==0

c=card(s,run,'CP08')
step(s,57)
hp=b.hp
fixture_cast(s,b,8)
assert b.hp<hp and c.t==57
step(s,110)
assert c.t==167 and not log(s,'CP08:window')
step(s,1)
assert log(s,'CP08:window')[-1].tick==168

fixture_cast(s,b)
assert b.hp==729 and run.pendingStage==3
wait(s,lambda:run.phase=='phase')
assert run.stage==3
c=card(s,run,'CP09')
a.inv=99999
step(s,138)
assert log(s,'CP09:window')[-1].tick==138
step(s,222)
assert c.t==360 and c.data.total-c.t==240
assert [e.tick for e in log(s,'CP09:window')]==[138,210,282,348]
assert compare_frame(s).endgameRun.phase=='recover'
moves=[]
serial=c.serial
for _ in range(2000):
    step(s,1)
    if run.cast and serial!=run.cast.serial:
        serial=run.cast.serial
        moves.append(run.cast.key)
        if moves[-1]=='CP09':
            break
assert moves==['CP05','CP06','CP08','CP09']

step(s,120)
assert len(log(s,'CP09'))==2 and run.cast
t=s.t
fixture_cast(s,b)
assert b.hp==0 and not run.cast
step(s,1)
assert run.status=='clear' and run.reward.first and run.reward.mora==4200
assert s.story.quests[quest].count==1 and s.endgame.stygian['capitano:normal'].clears==1
step(s,120)
assert run.defeatAge==120 and s.t<t+.1 and not run.cast
f=compare_frame(s)
assert f.endgameRun.phase=='defeat' and f.boss.hp==0
assert not any(d.source=='capitano-ice-sword-source-v1.png' for d in f.draws.values())
core.action(s,'endgame_exit')
core.enterStoryNode(s,hub)
core.action(s,'story_report:'+quest)
saved=validate_save(native(core.checkpoint(s)))
restored=core.restore(lua.table_from(saved,recursive=True))
assert restored.story.quests[quest].status=='complete' and restored.endgame.stygian['capitano:normal'].clears==1

s,run,b,a=start()
c=to_p2(s,run,b,a)
place(a,b.x-138)
a.inv=0
hp=a.hp
step(s,130)
assert a.hp<hp and len(log(s,'CP05:contact'))==1

s=ready(153)
s.mora=750000
assert core.giveArtifact(s,2,94,4)
core.action(s,'artifact_equip:1')
core.action(s,'artifact_upgrade:1')
assert core.giveArtifact(s,1,99,4)
core.action(s,'artifact_equip:2')
fixture=validate_save(native(core.checkpoint(s)))
(ROOT/'work/stygian-capitano-gear.json').write_text(json.dumps(fixture,ensure_ascii=False),encoding='utf8')
proof={'manifest_cards':list(spec['moves']), 'rank_levels':[r['level'] for r in spec['modes']],
       'coat_change_tick':60,'intro_end_tick':120,'direction_lock_honored':True,'path_no_damage':True,
       'ground_wave_jumped':True,'ground_wave_actual_contact_once':True,'pillar_gaps_min_U':1.2,
       'crossed_plate_on_foot_then_four_fragments':True,'stance_unshielded_fixed_168':True,
       'finale_hits':[138,210,282,348],'finale_recovery_ticks':240,'ordinary_cards_before_repeat':3,
       'clear_cancels_mid_dash_and_keeps_record_after_pose':True,'quest_report_restore':True}
(ROOT/'evidence/stygian-capitano-lua.json').write_text(json.dumps(proof,indent=2)+'\n',encoding='utf8')
print('Capitano Lua: nine card timings, hit checks, phase gates, projectiles, finale, rewards and persistence passed')
