"""Verify shared Azhdaha absorption and tail combat with actor-owned marks."""
import json

from experience import LEVELS, RUNTIME_EXP
from runtime import ROOT, native, runtime
from savegame import validate_save
from test_coop_anemo import TICK
from test_coop_childe import run, spot, strike
from test_coop_local import Client, LOCK, SESSIONS, advance, lab
from test_coop_travel import cross


BOSS, ENTITY = 'boss-29040101', 29040101
HUB, ARENA, QUEST = 'liyue-harbor', 'azhdaha-dragon-seal-arena', 'azhdaha-weekly-commission'
LEVEL = LEVELS[31]
EXP = LEVEL['normal_enemy_base_exp'] * RUNTIME_EXP['roles']['weekly_boss']


def prepare(core, state, pair, accepted=False):
    core.grantExp(state, LEVEL['maple_reference_total_exp_to_reach'], 'quest')
    core.enterStoryNode(state, HUB)
    if accepted:
        core.action(state, 'story_accept:' + QUEST)
        assert state.story.quests[QUEST].status == 'active'
    core.action(state, 'azhdaha_pair:' + pair)
    state.actors[2].hp=0


def party(core, accepted=False, *, shield=False):
    state=core.new(12)
    core.action(state,'story_start')
    prepare(core,state,'pyro:electro',accepted)
    if shield:
        xp=LEVELS[95]['maple_reference_total_exp_to_reach']-LEVEL['maple_reference_total_exp_to_reach']
        core.grantExp(state,xp,'quest')
        core.enterStoryNode(state,'fontaine-hub')
    core.enterStoryNode(state,ARENA)
    spot(state,375)
    return state


def event(state, key, actor=None, after=0):
    return [e.value for e in state.events.values() if e.seq>after and e.kind=='azhdaha:'+key
            and (actor is None or e.actor==actor)]


def move(step, slot, spec, name):
    slot.index=list(spec.orders[slot.form].values()).index(name)+1
    slot.rest=0
    slot.cast=None
    step()
    assert slot.cast.id==name
    return slot.cast


def change_form(lua,core,host,slot,spec,step,number):
    boss=slot.primary
    slot.cast=None
    strike(lua,core,host,boss,530)
    assert 0<boss.hp<=spec.hp*(4-number)/3
    step()
    assert slot.cast.id=='WZ09' and slot.form==number-1 and boss.invulnerable
    before=boss.hp
    strike(lua,core,host,boss,10000)
    assert boss.hp==before
    run(step,395)
    assert slot.form==number-1 and boss.invulnerable
    step()
    assert slot.form==number and not boss.invulnerable
    run(step,144)
    assert not slot.cast


def near_head(states,slot,spec,step):
    for state in states[:2]:
        spot(state,slot.primary.x-124)
    cast=move(step,slot,spec,'WZ01')
    run(step,cast.move.locks[1])
    for state in states[:2]:
        spot(state,cast.origin+cast.dir*110)
    return cast


def test_lua(lua,core):
    states=[party(core,i==0,shield=i==0) for i in range(4)]
    host,guest,observer,offside=states
    host.t,guest.t=390,4
    room=core.newCoop(host)
    for state in states:
        core.attachCoop(room,state)
    slot,spec=core.currentWeeklyBoss(host)
    boss=slot.primary
    assert boss.hp==1500 and len(room.enemies)==1
    step=lambda:core.stepCoop(room,TICK)
    for state,x in zip(states,(86,1010,38,1022)):
        spot(state,x)
    change_form(lua,core,host,slot,spec,step,2)
    assert all(core.frame(s).weeklyBoss.form==2 for s in states)
    cast=near_head(states,slot,spec,step)
    run(step,144-cast.t)
    assert [event(s,'WZ01:hit:pyro',1) for s in states]==[[1],[1],[],[]]
    assert [core.frame(s).weeklyBoss.marks['1'].element for s in states[:2]]==['pyro','pyro']
    assert core.frame(observer).weeklyBoss.marks['1'] is None

    hero,partner=guest.actors[1],guest.actors[2]
    partner.hp=partner.maxhp;partner.lock=9999
    core.action(guest,'swap')
    assert guest.active==2 and slot.marks[hero] and slot.marks[partner] is None
    spot(host,90);spot(guest,960)
    hero.x=980;hero.lock=9999
    assert core.attack(host,host.actors[1],'SK20')
    step()
    assert slot.marks[host.actors[1]] is None and slot.marks[hero]
    assert event(host,'mark-cleansed',1)==[0] and not event(guest,'mark-cleansed',1)
    slot.cast=None;slot.rest=9999
    run(step,480)
    assert len(event(guest,'mark-tick:pyro',1))==7 and slot.marks[hero] is None

    cast=near_head(states,slot,spec,step)
    host.actors[1].lock=0
    host.actors[1].cd.SK20=0
    assert core.attack(host,host.actors[1],'SK20')
    host.actors[1].waterShield.hp=1
    run(step,84-cast.t)
    assert host.actors[1].waterShield is None and slot.marks[host.actors[1]] is None
    assert slot.marks[partner].element=='pyro'
    run(step,cast.move.total-cast.t)
    for state,x in zip(states,(30,1000,32,1020)):
        spot(state,x)
    change_form(lua,core,host,slot,spec,step,3)
    assert event(host,'WZ09')==event(guest,'WZ09')==[1,2]

    c=move(step,slot,spec,'WZ12')
    run(step,179)
    assert slot.tailing and len(room.enemies)==1 and len(core.coopFrame(guest).enemies)==1
    assert all(core.frame(s).weeklyBoss.safeLane==1 for s in states)
    for state,x in zip(states,(516,541,125,174)):
        spot(state,x)
    step()
    assert [event(s,'WZ12:hit:electro',s.active) for s in states]==[[1],[1],[],[]]
    hp=boss.hp
    strike(lua,core,host,boss,24,range=360,limit=12)
    assert boss.hp==hp-22
    strike(lua,core,guest,boss)
    assert boss.hp==0 and slot.phase=='respawn' and not slot.cast and not list(slot.marks.keys())
    assert [s.kills for s in states]==[1,1,0,0]
    host_exp=max(1,int(EXP*RUNTIME_EXP['gap']['player_higher_by_over_40']+.5))
    assert [(s.progression.killXp,s.mora) for s in states[:2]]==[(host_exp,660),(EXP,660)]
    assert host.story.quests[QUEST].count==1 and not guest.story.quests[QUEST]
    for state in states[:2]:
        snapshot=validate_save(native(core.checkpoint(state)))
        assert snapshot['weeklyBosses'][BOSS]['hp']==0 and snapshot['weeklyBosses'][BOSS]['waitTicks']==3600
        assert snapshot['endgame']['bosses'][BOSS]['clears']==1
    assert all(any(d.source=='azhdaha-idle-source-v1.png' for d in core.frame(s).draws.values())
               for s in states[:2])
    run(step,40)
    assert all(not any(d.source=='azhdaha-idle-source-v1.png' for d in core.frame(s).draws.values())
               for s in states[:2])
    room.time=slot.waitUntil-TICK
    step()
    assert slot.generation==2 and boss.hp==0 and slot.primary.hp==1500
    assert native(core.frame(host).weeklyBoss.elementSlots)==['pyro','electro']


def test_adopt(lua,core):
    host,guest=party(core),party(core)
    slot,spec=core.currentWeeklyBoss(host)
    solo=lambda:core.step(host,TICK)
    spot(host,80)
    change_form(lua,core,host,slot,spec,solo,2)
    cast=near_head([host],slot,spec,solo)
    run(solo,72-cast.t)
    assert event(host,'WZ01:hit:pyro',1)==[1]
    room=core.newCoop(host)
    for state in (host,guest):
        core.attachCoop(room,state)
        spot(state,cast.origin+cast.dir*110)
    old=host.seq
    core.stepCoop(room,TICK)
    assert not event(host,'WZ01:hit:pyro',1,old) and event(guest,'WZ01:hit:pyro',1)==[1]
    assert slot.marks[host.actors[1]] and slot.marks[guest.actors[1]]


def test_http(url):
    host,guest,other=[Client(url) for _ in range(3)]
    for index,client in enumerate((host,guest,other)):
        client.frame(['story_start'])
        with LOCK:
            env=SESSIONS[client.sid]
            prepare(env['core'],env['state'],'hydro:electro' if index<2 else 'pyro:cryo',index==0)
    live=host.frame(['coop_create'])
    code=live['coop']['code']
    assert cross(host,635,ARENA)['weeklyBoss']['elementSlots']==['hydro','electro']
    joined=guest.frame(['coop_join:'+code])
    assert joined['azhdahaLobby']['selected']==['hydro','electro']
    assert cross(guest,635,ARENA)['coop']['peers'][0]['variant']=='水＋雷'
    cross(other,635,ARENA)
    separate=other.frame(['coop_join:'+code])
    assert separate['weeklyBoss']['elementSlots']==['pyro','cryo']
    assert all(not p['actors'] for p in separate['coop']['peers'])

    with LOCK:
        env=SESSIONS[host.sid]
        lua,core=env['lua'],env['core']
        states=[SESSIONS[c.sid]['state'] for c in (host,guest)]
        rooms=env['coop_room'].worlds
        fight=rooms[(ARENA,None,'hydro:electro')]
        other_fight=rooms[(ARENA,None,'pyro:cryo')]
        slot,spec=core.currentWeeklyBoss(states[0])
        boss=slot.primary
        step=lambda:core.stepCoop(fight,TICK)
        spot(states[0],85);spot(states[1],965)
        strike(lua,core,states[0],boss,530)
        run(step,48)
        assert slot.cast.id=='WZ09' and slot.cast.infusion=='hydro'
        hp=boss.hp
    for client in (host,guest):
        assert client.frame()['weeklyBoss']['hp']==hp
        assert cross(client,88,HUB)['coop']['code']==code
    frozen=(fight.tick,slot.cast.t)
    other_tick=other_fight.tick
    advance(host,other,.25)
    assert (fight.tick,slot.cast.t)==frozen and other_fight.tick>other_tick
    for client in (host,guest):
        assert cross(client,635,ARENA)['weeklyBoss']['hp']==hp
    with LOCK:
        run(step,slot.cast.move.total-slot.cast.t)
        spot(states[0],boss.x-85);spot(states[1],boss.x+85)
        strike(lua,core,states[0],boss,24)
        strike(lua,core,states[1],boss)
    for i,client in enumerate((host,guest)):
        save=client.frame(checkpoint=True)['checkpoint']
        assert save['weeklyBosses'][BOSS]['hp']==0 and save['weeklyBosses'][BOSS]['waitTicks']>0
        assert save['progression']['killXp']==EXP and save['mora']==660
        assert (save['story']['quests'].get(QUEST) or {}).get('count')==(1 if i==0 else None)
    assert other.frame()['weeklyBoss']['hp']==1500
    cross(other,88,HUB)
    with LOCK:
        env=SESSIONS[other.sid]
        state=env['state']
        xp=LEVELS[39]['maple_reference_total_exp_to_reach']-LEVEL['maple_reference_total_exp_to_reach']
        env['core'].grantExp(state,xp,'quest')
        spot(state,635)
    ranked=other.frame(['azhdaha_pair:hydro:electro',f'weekly_start:{BOSS}:entry'])
    assert ranked['story']['node']==ARENA and ranked['weeklyBoss']['difficulty']=='入門'
    assert ranked['weeklyBoss']['hp']==1500 and ranked['weeklyBoss']['elementSlots']==['hydro','electro']
    assert all(not p['actors'] for p in ranked['coop']['peers'])
    return dict(participants=3,pairSelectionPreservedOnJoin=True,separatePairWorlds=True,distinctRankWithSamePair=True,
                emptyInfusionPreserved=True,individualRewardsAndQuest=True)


if __name__=='__main__':
    lua,core=runtime()
    test_lua(lua,core)
    test_adopt(lua,core)
    del lua,core
    result={'lua':dict(participants=4,sharedAbsorptionAndTail=True,headAndFissureOneHitPerActor=True,
                       shieldBreakPreventsMark=True,shieldCleansesOnlyOwner=True,swapKeepsMarkOnOriginalActor=True,
                       sevenMarkPulsesWithinEightSeconds=True,tailSingleHitboxAndCleanup=True,roomDeathClock=True,
                       respawnKeepsPair=True,soloContactsPreservedOnAdoption=True)}
    with lab() as url:
        result['http']=test_http(url)
    (ROOT/'evidence/coop-azhdaha-lua-http.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
    print(result)
