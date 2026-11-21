"""Check the two Regisvines that cast a wave after striking the floor."""
import json

from experience import LEVELS, RUNTIME_EXP
from runtime import ROOT, runtime
from test_coop_anemo import TICK, place, wait_cast
from test_coop_local import Client, LOCK, SESSIONS, advance, lab
from test_coop_sumeru_field import SPECS, attack
from test_coop_travel import cross


PYRO = ('boss-26020201', 'liyue-harbor', 'pyro-approach', 1270, 'pyro-commission')
ELECTRO = ('boss-26020301', 'sumeru-hub', 'sumeru-field', 1240, 'electro-regisvine-commission')


def xp_for(spec):
    return LEVELS[spec['level']-1]['normal_enemy_base_exp'] * RUNTIME_EXP['roles']['field_boss']


def prepare(core, state, case, node, accept=False):
    boss_id, hub, _, _, quest = case
    spec = SPECS[boss_id]
    core.grantExp(state, LEVELS[spec['level']-1]['maple_reference_total_exp_to_reach'], 'quest')
    core.enterStoryNode(state, hub)
    if accept:
        core.action(state, 'story_accept:'+quest)
        assert state.story.quests[quest].status == 'active'
    core.enterStoryNode(state, node)


def player(core, case, accept=False):
    spec = SPECS[case[0]]
    state = core.new(12)
    core.action(state,'story_start')
    prepare(core,state,case,spec['node'],accept)
    place(state,spec['home']-88)
    return state


def share(core, case):
    states = [player(core,case,i==0) for i in range(4)]
    room = core.newCoop(states[0])
    for state in states:
        core.attachCoop(room,state)
    return room,states,lambda: core.stepCoop(room,TICK)


def hits(state, entity, since=0):
    return [e.value for e in state.events.values()
            if e.seq>since and e.kind=='hurt' and e.target==entity]


def check_moves(core, case):
    spec = SPECS[case[0]]
    slam, bolts, final = spec['moves']
    home,entity=spec['home'],spec['entity']
    room,states,step=share(core,case)
    slot=room.fieldSlot
    for state,x in zip(states,(home-88,home-86,home-195,home+110)):
        place(state,x)
    wait_cast(step,slot,slam['id'],slam['active'][0][1]-1)
    assert [hits(s,entity) for s in states] == [[slam['damage']]]*2+[[],[]]
    for state in states[:2]:
        place(state,home-181)
    wait_cast(step,slot,slam['id'],slam['shotTicks'][0]+32)
    assert [hits(s,entity) for s in states] == [[slam['damage']]]*2+[[slam['shotDamage']],[]]

    solo,newcomer=player(core,case),player(core,case)
    live=solo.fieldSlots[case[0]]
    wait_cast(lambda: core.step(solo,TICK),live,slam['id'],slam['active'][0][0])
    assert hits(solo,entity)==[slam['damage']]
    adopted=core.newCoop(solo)
    for state in (solo,newcomer):
        core.attachCoop(adopted,state)
        place(state,home-180)
    wait_cast(lambda: core.stepCoop(adopted,TICK),live,slam['id'],slam['shotTicks'][0]+26)
    assert [hits(s,entity) for s in (solo,newcomer)] == [[slam['damage']],[slam['shotDamage']]]

    for state,x in zip(states,(home-64,home-116,home+110,home-215)):
        place(state,x)
    before=[s.seq for s in states]
    wait_cast(step,slot,bolts['id'],bolts['shotTicks'][0]+13)
    assert slot.cast.shots[1] and not slot.cast.shots[2]
    place(states[0],home+102)
    wait_cast(step,slot,bolts['id'],bolts['shotTicks'][1]+23)
    assert slot.cast.shots[2]
    assert [hits(s,entity,seq) for s,seq in zip(states,before)] == [[bolts['shotDamage']]]*2+[[],[]]

    result={'slamAndWaveHitEachActorOnce':True,'soloWaveHistorySurvivesAdoption':True,
            'separateProjectilesHitSeparateParticipants':True}
    if final['pattern']=='rain':
        for state,x in zip(states,(home-95,home-104,home-120,home+145)):
            place(state,x)
        wait_cast(step,slot,final['id'],final['lock'])
        centers=list(slot.cast.landings.values())
        for state,x in zip(states,centers+[home+225]):
            place(state,x)
        before=[s.seq for s in states]
        wait_cast(step,slot,final['id'],final['active'][-1][1]-1)
        assert list(slot.cast.landings.values())==centers
        assert [hits(s,entity,seq) for s,seq in zip(states,before)]==[[final['damage']]]*3+[[]]
        result['fixedThreeLightningColumns']=True
    return result


def break_nucleus(lua,core,states,boss):
    left,right=boss.x-78,boss.x+78
    probe=lua.table(id=1,x=left,y=480,range=125,radial=True,limit=1,atk=10,mult=1,
                    critRate=0,color='#fff',element='physical',gain=0)
    for _ in range(2):
        core.resolveCast(states[0],probe)
    assert boss.coreHits==2
    assert attack(lua,core,states[1],boss,x=right,range=125)>0 and boss.coreHits==1
    assert attack(lua,core,states[0],boss,x=left,range=125)>0 and boss.coreHits==0


def check_battle(lua,core,case):
    spec=SPECS[case[0]]
    slam=spec['moves'][0]
    room,states,step=share(core,case)
    slot=room.fieldSlot
    boss=slot.enemy
    assert boss.maxhp==spec['hp']
    wait_cast(step,slot,slam['id'],slam['shotTicks'][0]+4)
    break_nucleus(lua,core,states,boss)
    interrupts_wave = bool(spec['core'].get('interrupt'))
    if not interrupts_wave:
        wait_cast(step,slot,slam['id'],slam['shotTicks'][0]+slam['shotLife']-1)
        assert boss.down==0
    spectator = states[-1]
    before = spectator.seq
    place(spectator,boss.x-181)
    step()
    assert slot.cast is None and boss.down==spec['core']['down']
    assert all(core.frame(s).fieldBoss.downTicks==boss.down for s in states)
    for _ in range(16):
        step()
    assert hits(spectator,spec['entity'],before)==[]
    assert attack(lua,core,states[1],boss,x=boss.x+78,range=125,atk=5000)>0
    assert slot.phase=='respawn'
    reward=(1,spec['mora'],xp_for(spec))
    assert [(s.kills,s.mora,s.progression.killXp) for s in states]==[reward]*2+[(0,0,0)]*2
    assert states[0].story.quests[case[-1]].count==1 and states[1].story.quests[case[-1]] is None
    return {'participants':4,'hp':spec['hp'],'downTicks':spec['core']['down'],
            'nucleusBreakTiming':'interrupts_live_wave' if interrupts_wave else 'waits_for_wave',
            'noWaveDamageDuringDown':True,
            'xpPerContributor':reward[-1],'moraPerContributor':reward[1]}


def check_http(url,case):
    boss_id,_hub,entry,gate,quest=case
    spec=SPECS[boss_id]
    clients=[Client(url),Client(url)]
    for i,client in enumerate(clients):
        client.frame(['story_start'])
        with LOCK:
            env=SESSIONS[client.sid]
            prepare(env['core'],env['state'],case,entry,i==0)
    code=clients[0].frame(['coop_create'])['coop']['code']
    assert clients[1].frame(['coop_join:'+code])['coop']['code']==code
    for client in clients:
        assert cross(client,gate,spec['node'])['coop']['code']==code
    with LOCK:
        h,g=[SESSIONS[c.sid] for c in clients]
        lua,core=h['lua'],h['core']
        states=[env['state'] for env in (h,g)]
        world=h['coop_room'].worlds[spec['node']]
        boss=world.fieldSlot.enemy
        for state,dx in zip(states,(-78,78)):
            place(state,boss.x+dx)
        break_nucleus(lua,core,states,boss)
        for _ in range(180):
            core.stepCoop(world,TICK)
            if boss.down:
                break
        assert boss.down==spec['core']['down']
    for client in clients:
        assert client.frame()['fieldBoss']['downTicks']>0
        assert cross(client,65,entry)['coop']['code']==code
    frozen=world.tick,boss.down
    advance(*clients,.2)
    assert (world.tick,boss.down)==frozen
    for client in clients:
        assert cross(client,gate,spec['node'])['coop']['code']==code
    with LOCK:
        for state,dx in zip(states,(-78,78)):
            place(state,boss.x+dx)
        assert attack(lua,core,states[1],boss,x=boss.x+78,range=125,atk=5000)>0
    for i,client in enumerate(clients):
        save=client.frame(checkpoint=True)['checkpoint']
        assert save['mora']==spec['mora'] and save['progression']['killXp']==xp_for(spec)
        assert save['endgame']['bosses'][boss_id]['clears']==1
        assert save['fieldBosses'][boss_id]['hp']==0 and save['fieldBosses'][boss_id]['waitTicks']>0
        if i==0:
            assert save['story']['quests'][quest]['count']==1
        else:
            assert quest not in save['story']['quests']
    return {'participants':2,'downPausedWhileEmpty':True,'personalQuestCreditAndRewardsSaved':True}


if __name__=='__main__':
    result={}
    lua,core=runtime()
    for case in (PYRO,ELECTRO):
        battle=check_moves(core,case) | check_battle(lua,core,case)
        with lab() as url:
            result[case[0]]={'lua':battle,'http':check_http(url,case)}
    (ROOT/'evidence/coop-regisvine-fields-lua-http.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
    print(json.dumps(result))
