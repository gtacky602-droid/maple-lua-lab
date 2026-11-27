"""Exercise the Raiden weekly arena with the real Lua input and save paths."""
import json

from experience import LEVELS
from runtime import ROOT, native, runtime
from savegame import validate_save

lua, core = runtime()
node, hub, quest = 'raiden-thunder-echo-arena', 'inazuma-town', 'raiden-weekly-commission'
uid = 'boss-29060201'
ticks = lua.eval('function(C,s,n) for i=1,n do C.step(s,1/60,{}) end end')
manifest = json.loads((ROOT/'docs/weekly-boss-v1/MANIFEST_INAZUMA.json').read_text(encoding='utf8'))


def act(s, key):
    core.action(s,key)


def save(s):
    return validate_save(native(core.checkpoint(s)))


def place(a,x,y=480):
    a.x,a.y,a.vy,a.ground,a.inv=x,y,0,True,0


def start():
    s=core.new(12)
    act(s,'story_start')
    core.grantExp(s,LEVELS[47]['maple_reference_total_exp_to_reach'],'quest')
    core.enterStoryNode(s,hub)
    return s


def arena():
    s=start()
    core.enterStoryNode(s,node)
    w,spec=core.currentWeeklyBoss(s)
    place(s.actors[1],50)
    s.actors[2].hp=0
    return s,w,spec


def events(s,key):
    return [e for e in s.events.values() if e.kind=='raiden:'+key]


def attack(s,x,origin=None):
    a=s.actors[1]
    place(a,origin if origin is not None else x-62)
    a.dir,a.lock,a.cd.normal=(1 if a.x<x else -1),0,0
    assert core.attack(s,a,'normal')


def awaken(s,w,spec):
    w.omen=spec.omen.max
    ticks(core,s,1)
    assert w.stage=='awaken' and w.primary.invulnerable
    ticks(core,s,spec.moves.WR09.total-1)
    assert w.armor==spec.armor.max and w.armorTime==0 and w.primary.invulnerable
    ticks(core,s,1)
    assert w.stage=='armored' and not w.primary.invulnerable and w.armorTime==0


def move(s,w,spec,key):
    w.rest=0
    if key=='WR14':
        w.sinceFlower=spec.armor.firstFlowerAfter
    elif w.stage=='armored':
        w.armorIndex=list(spec.armorOrder.values()).index(key)+1
    else:
        w.weapon=1 if key in list(spec.normalOrders[1].values()) else 2
        w.normalIndex[w.weapon]=list(spec.normalOrders[w.weapon].values()).index(key)+1
    ticks(core,s,1)
    assert w.cast.key==key
    return w.cast


s,w,spec=arena()
timed={}
for row in manifest['entries']:
    name=row['id']
    if not name.startswith('WR') or 'total_ticks' not in row:
        continue
    for key,card in [(name,row),*((name+'.'+v['name'],v) for v in row.get('variants',[]))]:
        m=spec.moves[key]
        assert m.total==card['total_ticks'] and m.recovery==card['recovery'][0],key
        assert list(native(m.locks))==card['lock_ticks'] and list(native(m.windows))==card['active_windows'],key
        assert list(native(m.launches))==[i for p in card['projectiles'] for i in p['spawn_ticks']],key
        if name in ('WR09','WR14','WR15','WR16','WR17'):
            continue
        trial,boss,rules=arena()
        if name in ('WR10','WR11','WR12','WR13'):
            awaken(trial,boss,rules)
        cast=move(trial,boss,rules,key)
        ticks(core,trial,m.total)
        assert boss.cast is None, key
        started=events(trial,name)[0]
        assert [round((e.t-started.t)*60) for e in events(trial,name+':lock')]==card['lock_ticks'],key
        assert [round((e.t-started.t)*60) for e in events(trial,name+':spawn')]==list(native(m.launches)),key
        timed[key]=cast.t

s,w,spec=arena()
w.weaponCasts=3
ticks(core,s,1)
assert w.stage=='switch' and not w.primary.invulnerable and w.weapon==1
ticks(core,s,spec.omen.switchTicks)
assert w.stage=='normal' and w.weapon==2
s.actors[1].atk=10000
attack(s,w.primary.x)
assert w.primary.hp==0 and s.kills==1 and not events(s,'WR09')

s,w,spec=arena()
c=move(s,w,spec,'WR05')
ticks(core,s,60)
eye=w.objects[1]
assert core.frame(s,'sprite').weeklyBoss.targets[1].charges==4
for hits in range(3,-1,-1):
    attack(s,eye.x)
    assert eye.charges==hits
    if hits:
        ticks(core,s,spec.objects.cooldown)
assert c.downUntil==c.t+108 and not w.primary.invulnerable and s.kills==0

s,w,spec=arena()
c=move(s,w,spec,'WR05.triple')
ticks(core,s,60)
place(s.actors[1],332)
hp=s.actors[1].hp
ticks(core,s,320)
assert hp==s.actors[1].hp and not events(s,'WR05:hit')

s,w,spec=arena()
c=move(s,w,spec,'WR06')
ticks(core,s,126)
assert core.frame(s,'rect','h32c16').weeklyBoss.targets[1].clue=='╳'
shadows=[d for d in core.frame(s,'sprite').draws.values() if d.opacity==.58]
assert len(shadows)==4 and all(d.tint is None for d in shadows)
a=s.actors[1]
place(a,365)
cast=lua.table_from({'id':1,'playerInputAt':s.t,'atk':300,'x':365,'y':480,'dir':1,'range':750,
                     'radial':True,'limit':12,'mult':1,'gain':0,'color':'#fff','element':'physical'})
core.resolveCast(s,cast)
assert len([e for e in w.objects.values() if e.hp>0])==3 and not c.downUntil
core.resolveCast(s,cast)
assert len(events(s,'WR06:choice'))==1 and w.primary.invulnerable
attack(s,144,100)
assert c.downUntil==c.t+120 and not w.primary.invulnerable

s,w,spec=arena()
awaken(s,w,spec)
c=move(s,w,spec,'WR12')
a=s.actors[1]
place(a,480)
hp=a.hp
jump_last=lua.eval("""function(C,s,c)
 for t=1,440 do
  if t==384 then C.action(s,'jump') end
  C.step(s,1/60,{jump=t>=384 and t<420})
 end
end""")
jump_last(core,s,c)
assert not [e for e in events(s,'WR12:hit') if e.value==4]
assert a.hp>0 and len(events(s,'WR12:spawn'))==4

s,w,spec=arena()
awaken(s,w,spec)
c=move(s,w,spec,'WR14')
armor,time_before=w.armor,w.armorTime
ticks(core,s,60)
x=c.location
assert core.frame(s,'sprite').weeklyBoss.flower.ready
place(s.actors[1],x)
assert c.charges==0
fake={'id':1,'x':x-50,'y':480,'atk':500,'dir':1,'gain':0,'range':98,'limit':1,'mult':1,'color':'#fff','element':'electro'}
for old in ({}, {'playerInputAt':c.opened-.1}, {'playerInputAt':s.t,'reaction':True}):
    core.resolveCast(s,lua.table_from(fake|old))
assert c.charges==0
for charge in range(1,6):
    attack(s,x)
    assert c.charges==charge
    ticks(core,s,30)
assert w.armor==armor and w.armorTime==time_before
ticks(core,s,spec.moves.WR14.total-c.t)
assert w.cast.id=='WR15' and w.cast.charges==5 and not len(w.objects)
c=w.cast
a,ally=s.actors[1],s.actors[2]
place(a,x)
ally.hp,ally.maxhp=140,140
place(ally,960-x)
ally.ground=False;ally.y=290
before=a.hp,ally.hp
ticks(core,s,59)
assert (a.hp,ally.hp)==before and w.armor==armor
ticks(core,s,1)
assert a.hp==before[0] and len(events(s,'WR15:protected'))==1
flower=core.frame(s,'sprite').weeklyBoss.flower
assert flower.inside and flower.slashResult=='protected'
s.active=2
flower=core.frame(s,'sprite').weeklyBoss.flower
assert not flower.inside and flower.slashResult=='hit'
s.active=1
assert w.armor==armor-spec.armor.slashDrain and len(events(s,'WR15:drain'))==1
ticks(core,s,48)
assert not core.frame(s).weeklyBoss.flower.protected
ticks(core,s,132)
assert w.cast is None and w.armorTime==time_before

# Uncharged flowers still lead to an ordinary damage calculation.
s,w,spec=arena()
awaken(s,w,spec)
c=move(s,w,spec,'WR14')
ticks(core,s,720)
place(s.actors[1],c.location)
hp=s.actors[1].hp
ticks(core,s,60)
assert s.actors[1].hp==hp-spec.moves.WR15.damage and s.actors[1].hp>0
assert not events(s,'WR15:protected')

s,w,spec=arena()
awaken(s,w,spec)
c=move(s,w,spec,'WR14')
ticks(core,s,60)
shock=lua.table_from(fake|{'playerInputAt':s.t,'x':c.location-50})
core.resolveCast(s,shock)
assert c.charges==5 and len(events(s,'WR14:charge'))==1
w.armor=0
ticks(core,s,1)
assert w.stage=='collapse' and not len(w.objects) and not events(s,'WR15')

s,w,spec=arena()
awaken(s,w,spec)
base=w.armor
def armor_contact(owner,element,recency):
    cast=lua.table_from(fake|{'id':owner,'atk':4,'x':w.primary.x-45,
                             'playerInputAt':recency,'element':element})
    core.resolveCast(s,cast)
    return cast

armor_contact(1,'pyro',w.armorOpened-.05)
assert w.armor==base
hit=armor_contact(1,'cryo',s.t)
core.resolveCast(s,hit)
armor_contact(1,'pyro',s.t)
assert w.armor==base-2
armor_contact(2,'pyro',s.t)
assert w.armor==base-4
ticks(core,s,40)
armor_contact(1,'pyro',s.t)
assert len(events(s,'WR18:hit'))==2
ticks(core,s,20)
armor_contact(1,'pyro',s.t)
assert len(events(s,'WR18:hit'))==3

s,w,spec=arena()
awaken(s,w,spec)
c=move(s,w,spec,'WR14')
ticks(core,s,60)
c.flower.hp=0
ticks(core,s,660)
assert events(s,'WR14:cancel') and not events(s,'WR15')
w.armor=0
ticks(core,s,1)
assert w.stage=='collapse' and not len(w.objects) and w.primary.invulnerable
ticks(core,s,95)
assert w.primary.invulnerable
ticks(core,s,1)
assert not w.primary.invulnerable and core.frame(s).weeklyBoss.down==480
assert native(core.frame(s).weeklyBoss.raidenMeter)=={'name':'装甲','value':0}
n=w.primary.hp
attack(s,w.primary.x)
assert w.primary.hp<n
ticks(core,s,479)
assert w.stage=='collapse' and not w.primary.invulnerable
ticks(core,s,1)
assert w.stage=='repair' and not w.primary.invulnerable
n=w.primary.hp
ticks(core,s,180)
assert w.stage=='normal' and w.omen==0 and w.primary.hp==n

s,w,spec=arena()
awaken(s,w,spec)
flower=move(s,w,spec,'WR14')
ticks(core,s,60)
attack(s,flower.location)
assert flower.charges==1
core.enterStoryNode(s,hub)
assert not any(enemy.kind=='flower' for enemy in s.enemies.values())
core.enterStoryNode(s,node)
assert w.stage=='normal' and w.omen==0 and not len(w.objects) and w.primary.hp==spec.hp

s=start()
assert core.giveArtifact(s,1,45,3)
act(s,'artifact_equip:1')
s.mora=25000
act(s,'artifact_upgrade:1')
act(s,'artifact_upgrade:1')
assert s.actors[1].maxhp>400
assert core.giveArtifact(s,2,45,3)
act(s,'artifact_equip:2')
(ROOT/'work/raiden-weekly-gear.json').write_text(json.dumps(save(s),ensure_ascii=False),encoding='utf8')
act(s,'story_accept:'+quest)
place(s.actors[1],1305)
act(s,'story_portal:'+node)
assert s.story.node==node and s.story.quests[quest].status=='active'
w,spec=core.currentWeeklyBoss(s)
s.actors[1].atk=10000
attack(s,w.primary.x)
assert w.primary.hp==0 and w.waitUntil and s.kills==1 and s.story.quests[quest].count==1
act(s,'story_fast:'+hub)
act(s,'story_report:'+quest)
assert s.story.quests[quest].status=='complete'
again=core.restore(lua.table_from(save(s),recursive=True))
assert again.weeklySlots[uid].primary.hp==0 and again.story.quests[quest].status=='complete'

result={'live_card_duration':timed,'early_lethal_no_hp_lock':True,'eye_four_normals_and_safe_lane':True,
        'shade_aoe_nearest_only':True,'final_wave_jumped':True,'flower_five_normals':True,'reject_old_reaction_and_ai':True,
        'dome_and_drain_once':True,'unprotected_standard_damage':True,'missing_flower_cancel':True,
        'electro_flower_single_hit':True,'armor_zero_cancels_flower':True,'armor_four_per_second_budget':True,
        'vulnerable_down_ticks':480,'no_repair_heal':True,'exit_cleans_old_trial':True,'weekly_report_and_restore':True}
(ROOT/'evidence/raiden-weekly-lua.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print('Raiden Lua: card timings, eyes, shades, waves, flower, armor down, rewards and restore passed')
