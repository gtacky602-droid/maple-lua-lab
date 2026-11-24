"""Verify player input provenance, cover, rift settlement and rewind in the live Lua runtime."""
import json
from experience import LEVELS
from runtime import ROOT, native, runtime
from savegame import validate_save

lua,core=runtime()
hub,outer,inner='nod-town','nod-false-moon-court','nod-false-moon-rift'
quest,uid='false-moon-weekly-commission','boss-29130201'
advance=lua.eval('function(C,s,n,input) for i=1,n do C.step(s,1/60,input) end end')


def step(s,n,**keys):
    advance(core,s,n,lua.table(**keys))


def place(a,x,y=480):
    a.x,a.y,a.vy,a.ground=x,y,0,True


def start(enter=True, *, electro=False):
    s=core.new(12)
    core.action(s,'story_start')
    core.grantExp(s,LEVELS[131]['maple_reference_total_exp_to_reach'],'quest')
    if electro:
        core.enterStoryNode(s,'inazuma-port')
    core.enterStoryNode(s,hub)
    if not enter:
        return s
    core.enterStoryNode(s,outer)
    s.actors[2].hp=0
    place(s.actors[1],246)
    w,spec=core.currentWeeklyBoss(s)
    return s,w,spec


def events(s,key):
    return [e for e in s.events.values() if e.kind=='false-moon:'+key]


def choose(s,w,spec,key):
    w.rest,w.cast=0,None
    w.index=list(spec.order.values()).index(key)+1
    step(s,1)
    assert w.cast.key==key
    return w.cast


def normal(s,e,atk=10000):
    a=s.actors[s.active]
    place(a,e.x-67)
    a.dir,a.atk,a.lock,a.cd.normal=1,atk,0,0
    assert core.attack(s,a,'normal')


s,w,spec=start()
manifest=json.loads((ROOT/'docs/weekly-boss-v1/MANIFEST_DOTTORE.json').read_text(encoding='utf8'))
cards=[]
for row in manifest['entries']:
    if row['boss']!='false_moon':
        continue
    key=row['id']
    cards.append(key)
    m=spec.moves[key]
    if row['kind']=='fixed':
        assert (m.total,m.recovery)==(row['total_ticks'],row['recovery'][0]),key
        assert list(native(m.locks))==row['lock_ticks'],key
        assert list(native(m.windows))==row['active_windows'],key
assert list(native(spec.moves.WM09.rule_window))==[120,420]

a=s.actors[1]
c=choose(s,w,spec,'WM09')
rule=c.players[s]
step(s,117)
a.dash,a.dashDir=.25,1
step(s,25)
assert c.t==142 and not rule.violation
place(a,330)
step(s,16,attack=True)
assert not rule.violation
step(s,9,right=True)
assert rule.violation.kind=='walk' and len(events(s,'WM09:violation:walk'))==1
a.cd.dodge=0
core.action(s,'dodge')
assert not events(s,'WM09:violation:dodge')
ally=s.actors[2]
ally.hp=ally.maxhp
core.action(s,'swap')
assert s.active==2
step(s,420-c.t)
assert rule.sentence.actor.id==2
place(ally,448)
place(a,448)
step(s,36)
a.inv=0
ally.inv=0
p1,p2=a.hp,ally.hp
step(s,24)
assert a.hp==p1 and ally.hp<p2 and len(events(s,'WM12:hit'))==1


s,w,spec=start()
c=choose(s,w,spec,'WM09')
step(s,419)
place(s.actors[1],320)
step(s,1,right=True)
assert not c.players[s].violation and len(events(s,'WM09:success'))==1

s,w,spec=start()
a=s.actors[1]
c=choose(s,w,spec,'WM09')
step(s,119)
core.action(s,'jump')
step(s,50,jump=True)
assert not c.players[s].violation and a.ground
core.action(s,'jump')
step(s,1,jump=True)
assert c.players[s].violation.kind=='jump' and not a.ground

s,w,spec=start()
a=s.actors[1]
a.dir=-1
c=choose(s,w,spec,'WM10')
a.dir=1
place(a,310)
step(s,124)
assert not c.players[s].violation and c.players[s].logical==-1
step(s,1,right=True)
assert c.players[s].violation.kind=='facing' and len(events(s,'WM10:violation:facing'))==1

s,w,spec=start(electro=True)
a=s.actors[1]
c=choose(s,w,spec,'WM09')
step(s,119)
s.macroInputAt=c.players[s].startedAt+1.9
dash=a.dash
key='SK11'
assert core.skillDefinitions[key].dash and core.growthSkillCondition(s,key) is True
step(s,2)
assert core.attack(s,a,key)
s.macroInputAt=None
assert a.dash!=dash and not c.players[s].violation
a.lock,a.cd[key]=0,0
assert core.attack(s,a,key) and c.players[s].violation.kind=='root'

s,w,spec=start()
c=choose(s,w,spec,'WM08')
step(s,150)
safe,other=s.actors[1],s.actors[2]
other.hp=other.maxhp
step(s,209)
place(safe,160)
place(other,623)
safe.inv,other.inv=0,0
p1,p2=safe.hp,other.hp
step(s,1)
assert safe.hp==p1 and other.hp<p2
assert events(s,'WM08:ward')[-1].actor==1

s,w,spec=start()
a=s.actors[1]
c=choose(s,w,spec,'WM13')
step(s,120)
core.action(s,'encounter_interact')
assert c.confirm is None
place(a,480)
core.action(s,'encounter_interact')
assert c.confirm==210
core.action(s,'encounter_cancel')
step(s,90)
assert w.cast.key=='WM13' and s.story.node==outer
core.action(s,'encounter_interact')
step(s,90)
assert w.cast.key=='WM14'
a.hp,a.cd.skill2,s.gauge=100,10,34
step(s,89)
assert s.story.node==outer
step(s,1)
assert s.story.node==inner and w.epoch==1 and a.hp==100 and s.gauge==34 and 8<a.cd.skill2<9
step(s,90)
assert w.cast.key=='WM15' and len(w.shadows)==3 and w.primary.invulnerable
normal(s,w.shadows[1])
assert w.innerCount==1 and s.kills==0
place(a,858)
core.action(s,'encounter_interact')
step(s,1)
assert w.cast.key=='WM16' and not len(w.shadows)
hp=w.primary.hp
step(s,95)
assert s.story.node==outer and w.epoch==2 and w.primary.hp==hp
step(s,1)
assert w.primary.hp==hp-136 and len(events(s,'WM16:loss'))==1
step(s,24)
assert w.phase=='exposure' and not w.primary.invulnerable and w.budget==680
step(s,360)
assert w.primary.invulnerable and len(events(s,'WM16:loss'))==1

s,w,spec=start()
c=choose(s,w,spec,'WM13')
step(s,810)
place(s.actors[1],480)
core.action(s,'encounter_interact')
assert c.confirm is None
step(s,90)
assert s.story.node==outer and w.cycle==0 and w.cast is None

s,w,spec=start()
a=s.actors[1]
c=choose(s,w,spec,'WM13')
step(s,120)
place(a,480)
core.action(s,'encounter_interact')
step(s,90+180)
assert w.cast.key=='WM15'
w.budget=80
splash=lua.table(id=1,atk=10000,x=480,y=480,dir=1,radial=True,range=600,limit=4,mult=1,element='physical',color='#fff2d7',gain=0)
core.resolveCast(s,splash)
assert w.innerCount==3
step(s,1+96)
assert len(events(s,'WM16:loss'))==1 and events(s,'WM16:loss')[0].value==80
assert w.budget==0 and s.kills==0

s,w,spec=start()
a=s.actors[1]
p=w.primary
burst=lua.table(id=1,atk=1450,x=p.x-60,y=480,dir=1,range=125,limit=1,mult=1,element='physical',color='#fff2d7',gain=0)
core.resolveCast(s,burst)
assert (w.rewindLoss or 0)>=850 and p.hp>0
step(s,spec.noticeTicks+1)
assert w.cast.key=='WM17'
hp=p.hp
step(s,119)
assert p.hp==hp
step(s,1)
assert p.hp-hp==340 and w.rewindUsed
core.resolveCast(s,burst)
assert w.rewindLoss is None

s=start(False)
s.mora=480000
assert core.giveArtifact(s,1,82,3)
core.action(s,'artifact_equip:1')
core.action(s,'artifact_upgrade:1')
assert core.giveArtifact(s,2,40,3)
core.action(s,'artifact_equip:2')


def save():
    return validate_save(native(core.checkpoint(s)))


(ROOT/'work/false-moon-weekly-gear.json').write_text(json.dumps(save(),ensure_ascii=False),encoding='utf8')
core.action(s,'story_accept:'+quest)
place(s.actors[1],210)
core.action(s,'story_portal:'+outer)
assert s.story.node==outer
w,spec=core.currentWeeklyBoss(s)
normal(s,w.primary)
assert s.kills==1 and s.story.quests[quest].count==1 and not events(s,'WM17:reserve')
core.action(s,'story_fast:'+hub)
core.action(s,'story_report:'+quest)
restored=core.restore(lua.table_from(save(),recursive=True))
assert restored.story.quests[quest].status=='complete' and restored.weeklySlots[uid].primary.hp==0

proof={'manifest_cards':cards,'rule_window':[120,420],'old_dash_and_normal_excluded':True,
       'old_macro_root_excluded_new_root_detected':True,'boundary_420_allows_movement':True,
       'buffered_old_jump_excluded_fresh_jump_detected':True,
       'logical_facing_only':True,'owner_only_sentence_after_swap':True,'cover_contains_actor':True,
       'confirmation_can_cancel':True,'late_confirmation_cannot_cross_deadline':True,
       'two_real_scenes_and_no_hp_ct_gauge_reset':True,
       'early_return_only_pays_killed_shadows':True,'settlement_once_and_cap':True,
       'exposure_ticks':360,'rewind_heal_once':340,'lethal_hit_priority':True,'quest_report_restore':True}
(ROOT/'evidence/false-moon-weekly-lua.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print('False Moon Lua: input windows, cover, scenes, actual shadow deaths, bounded rewind, save passed')
