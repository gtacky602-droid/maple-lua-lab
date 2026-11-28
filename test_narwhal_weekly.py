"""Check Narwhal's two real story scenes, attack timings and input ownership."""
import json
import math

from experience import LEVELS
from runtime import ROOT, native, runtime
from savegame import validate_save

lua, core = runtime()
hub,outer,inner='fontaine-hub','narwhal-star-sea','narwhal-inner-echo'
quest,uid='narwhal-weekly-commission','boss-29090101'
ticks=lua.eval('function(C,s,n) for i=1,n do C.step(s,1/60,{}) end end')
manifest=json.loads((ROOT/'docs/weekly-boss-v1/MANIFEST_FONTAINE.json').read_text(encoding='utf8'))


def act(s,key):
    core.action(s,key)


def save(s):
    return validate_save(native(core.checkpoint(s)))


def start():
    s=core.new(12)
    act(s,'story_start')
    core.grantExp(s,LEVELS[83]['maple_reference_total_exp_to_reach'],'quest')
    core.enterStoryNode(s,hub)
    return s


def place(a,x,y=480):
    a.x,a.y,a.vy,a.ground,a.inv=x,y,0,True,0


def arena():
    s=start()
    core.enterStoryNode(s,outer)
    w,spec=core.currentWeeklyBoss(s)
    s.actors[2].hp=0
    place(s.actors[1],34)
    return s,w,spec


def hit(s,x,atk=9,offset=55):
    a=s.actors[1]
    place(a,x-offset)
    a.dir,a.atk,a.lock,a.cd.normal=1,atk,0,0
    assert core.attack(s,a,'normal')


def events(s,key):
    return [e for e in s.events.values() if e.kind=='narwhal:'+key]


def move(s,w,spec,key):
    order=spec.outerOrder if w.stage=='outer' else spec.innerOrder
    field='outerIndex' if w.stage=='outer' else 'innerIndex'
    w[field]=list(order.values()).index(key)+1
    w.rest=0
    ticks(core,s,1)
    assert w.cast.key==key
    return w.cast


def swallow(s,w,spec):
    w.h,w.queued=100,True
    ticks(core,s,1)
    assert w.stage=='swallow' and w.primary.invulnerable and s.story.node==outer
    assert len(s.pending)==0


def entry(s,w,spec):
    swallow(s,w,spec)
    ticks(core,s,180)
    assert w.stage=='inner' and s.story.node==inner and len(s.enemies)==4
    assert core.currentWeeklyBoss(s)[0].primary.id==w.primary.id


checked={}
for root in manifest['entries']:
    key=root['id']
    if not key.startswith('WV') or 'total_ticks' not in root:
        continue
    for name,r in [(key,root),*((key+'.'+v['key'],v) for v in root.get('variants',[]))]:
        s,w,spec=arena()
        m=spec.moves[name]
        assert (m.total,m.recovery)==(r['total_ticks'],r['recovery'][0]),name
        assert list(native(m.locks))==r['lock_ticks'] and list(native(m.windows))==r['active_windows'],name
        assert list(native(m.launches))==[t for q in r['projectiles'] for t in q['spawn_ticks']],name
        if key in ('WV07','WV14','WV15'):
            continue
        if key in ('WV08','WV09','WV10','WV12'):
            entry(s,w,spec)
        if key=='WV12':
            w.variant=list(spec.variants.values()).index(name)+1
            q=move(s,w,spec,'WV11')
            ticks(core,s,spec.kernel.failure)
            assert q.t==420 and len(events(s,'WV11:failed'))==1
            c=w.cast
            assert c.key==name
        else:
            c=move(s,w,spec,name)
        ticks(core,s,m.total)
        assert w.cast is None and c.t==m.total,name
        origin=events(s,name)[0]
        for suffix,field in [('lock',m.locks),('launch',m.launches)]:
            assert [round((e.t-origin.t)*60) for e in events(s,name+':'+suffix)]==list(field.values()),name
        checked[name]=c.t

s,w,spec=arena()
a=s.actors[1]
wide=lua.table_from({'id':1,'radial':True,'x':480,'y':480,'range':450,'atk':30,'mult':1,'gain':0,
                     'limit':6,'color':'#fff','element':'physical'})
core.resolveCast(s,wide)
assert s.hits==1 and w.h==5
ticks(core,s,24)
core.resolveCast(s,wide)
assert s.hits==2 and w.h==5
assert len(events(s,'WV06:hit'))==1
w.h,w.queued=100,True
w.primary.hp=spec.hp*.2+10
hit(s,w.primary.x,30)
assert not w.queued and events(s,'WV06:cancel')
w.outerIndex=2
w.rest=0
ticks(core,s,1)
assert w.cast.key=='WV01' and not events(s,'WV05')
hit(s,w.primary.x,10000)
assert w.primary.hp==0 and s.kills==1 and not events(s,'WV07')

s,w,spec=arena()
c=move(s,w,spec,'WV05')
ticks(core,s,60)
eye=w.special
assert eye.hp==8 and not core.frame(s).weeklyBoss.damageable
w.h=84
for i in range(4):
    hit(s,eye.x)
    ticks(core,s,8)
    assert eye.hp==6-2*i
    if i<3: ticks(core,s,28)
assert len(events(s,'WV05:eye-hit'))==8 and w.h==100 and w.queued and w.stage=='outer'
assert c.successUntil-c.t==35
ticks(core,s,35)
assert w.stage=='outer' and w.cast is None
ticks(core,s,1)
assert w.stage=='swallow' and not events(s,'WV05:hit')

s,w,spec=arena()
a=s.actors[1]
a.hp=60;a.cd.skill1=10;s.gauge=41
s.blizzard=lua.table_from({'x':238,'y':480,'expires':s.t+3})
s.moonDomain=s.t+10
swallow(s,w,spec)
assert s.blizzard is None and s.moonDomain is None
assert core.frame(s).weeklyBoss.narwhal.transitionTicks==spec.transition.sceneTick
ticks(core,s,95)
assert s.story.node==outer and core.frame(s).weeklyBoss.narwhal.transitionTicks==1
ticks(core,s,1)
assert s.story.node==inner and a.x==238 and a.hp==60 and s.actors[2].hp==0 and s.gauge==41
assert core.frame(s).weeklyBoss.narwhal.transitionTicks==spec.moves.WV07.total-spec.transition.sceneTick
assert math.isclose(a.cd.skill1,10-97/60) and w.epoch==2
assert not core.attack(s,a,'normal')
ticks(core,s,84)
c=move(s,w,spec,'WV11')
ticks(core,s,59)
assert not w.special
ticks(core,s,1)
obj=w.special
assert (obj.hitTop,obj.hitBottom,obj.hitHalfWidth)==(480-1.15*88,480-.65*88,.35*88)
assert math.isclose(core.targetHeight(a,obj),480-57.2)
fake={'id':1,'x':obj.x-60,'y':480,'dir':1,'atk':9,'range':125,'limit':2,'mult':1,'gain':0,'color':'#fff','element':'physical'}
for old in ({},{'playerInputAt':obj.opened-.02},{'playerInputAt':s.t,'reaction':True}):
    core.resolveCast(s,lua.table_from(fake|old))
assert obj.hp==4
for left in range(3,-1,-1):
    hit(s,obj.x,offset=146)
    assert obj.hp==left
    if left: ticks(core,s,12)
assert w.shadow.hp==570 and w.primary.hp==2200 and c.successUntil==c.t+96
assert len(events(s,'WV11:kernel-hit'))==4 and len(events(s,'WV13:kernel-loss'))==1
hit(s,w.shadow.x,10000)
assert w.stage=='expel' and w.shadow.hp==0 and s.kills==0
assert core.frame(s).weeklyBoss.narwhal.transitionTicks==spec.transition.sceneTick
ticks(core,s,95)
assert s.story.node==inner and core.frame(s).weeklyBoss.narwhal.transitionTicks==1
ticks(core,s,1)
assert s.story.node==outer and w.primary.hp==2200 and w.epoch==4
assert core.frame(s).weeklyBoss.narwhal.exposureOpensIn==spec.moves.WV14.total-spec.transition.sceneTick+spec.transition.weakOpen
ticks(core,s,23)
assert w.primary.hp==2200
ticks(core,s,1)
assert w.primary.hp==1760 and len(events(s,'WV14:return-loss'))==1
assert core.frame(s).weeklyBoss.narwhal.exposureOpensIn==120
ticks(core,s,60)
view=core.frame(s).weeklyBoss.narwhal
assert w.stage=='weak' and w.primary.invulnerable and view.exposureOpensIn==60 and view.exposure is None
ticks(core,s,60)
assert core.frame(s).weeklyBoss.narwhal.exposure==600 and not w.primary.invulnerable
ticks(core,s,600)
view=core.frame(s).weeklyBoss.narwhal
assert w.primary.invulnerable and w.stage=='weak' and view.exposure is None and view.exposureOpensIn is None
ticks(core,s,60)
assert w.stage=='outer' and w.h==0
entry(s,w,spec)
assert w.entries==2 and w.shadow.hp==380 and w.shadow.maxhp==380

s,w,spec=arena()
entry(s,w,spec)
c=move(s,w,spec,'WV11')
ticks(core,s,359)
x=w.special.x
hit(s,x)
assert w.special.hp==3
ticks(core,s,1)
assert w.special is None and len(events(s,'WV11:failed'))==1
hit(s,x)
assert len(events(s,'WV11:kernel-hit'))==1
ticks(core,s,60)
assert w.cast.key=='WV12'

s=start()
assert core.giveArtifact(s,1,82,3)
act(s,'artifact_equip:1')
s.mora=280000
act(s,'artifact_upgrade:1')
assert core.giveArtifact(s,2,40,3)
act(s,'artifact_equip:2')
(ROOT/'work/narwhal-weekly-gear.json').write_text(json.dumps(save(s),ensure_ascii=False),encoding='utf8')
act(s,'story_accept:'+quest)
place(s.actors[1],700)
act(s,'story_portal:'+outer)
assert s.story.node==outer and s.story.quests[quest].status=='active'
w,spec=core.currentWeeklyBoss(s)
s.actors[2].hp=0
entry(s,w,spec)
assert save(s)['weeklyBosses'][uid]['hp']==spec.hp
core.enterStoryNode(s,hub)
core.enterStoryNode(s,outer)
assert w.epoch==0 and w.stage=='outer' and w.entries==0 and w.shadow is None
entry(s,w,spec)
w.primary.hp=spec.hp*.15
hit(s,w.shadow.x,10000)
ticks(core,s,120)
assert s.story.node==outer and w.primary.hp==0 and s.story.quests[quest].count==1 and s.kills==1
act(s,'story_fast:'+hub)
act(s,'story_report:'+quest)
restored=core.restore(lua.table_from(save(s),recursive=True))
assert restored.story.quests[quest].status=='complete' and restored.weeklySlots[uid].primary.hp==0

result={'live_timings':checked,'shared_segments':True,'hostility_one_per_cast_low_hp_cancel':True,
        'eye_eight_real_hits':True,'real_story_scene_and_preserved_hp_ct':True,
        'kernel_ground_reach_four_new_casts':True,'kernel_half_open_ticks':[60,360],'kernel_failed_transition':420,
        'shadow_hp_separate_and_second_halves':True,'return_damage_once':True,'exposure_ticks':600,
        'transition_countdowns_at_scene_switch':True,'exposure_countdown_after_return_loss_ticks':120,
        'scene_exit_resets_trial':True,'scene_casts_cleared':True,'low_hp_uses_close_range_moves':True,
        'return_lethal_and_report_restore':True}
(ROOT/'evidence/narwhal-weekly-lua.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print('Narwhal Lua: outer, eye, two scenes, corrected kernel, return, one reward and restore passed')
