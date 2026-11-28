"""Cover the field Geovishap's shared cast and per-party shield and rewards."""
import json

from experience import LEVELS, RUNTIME_EXP
from runtime import ROOT, runtime
from test_coop_anemo import TICK, place, wait_cast
from test_coop_local import Client, LOCK, SESSIONS, advance, lab
from test_coop_sumeru_field import SPECS, attack
from test_coop_travel import cross


BOSS, ENTITY = 'boss-26050101', 26050101
HUB, ENTRY, ARENA = 'liyue-harbor', 'primo-approach', 'primo-field-vault'
QUEST = 'primo-commission'
SPEC = SPECS[BOSS]
LEVEL = LEVELS[SPEC['level']-1]
SHIELD_LEVEL = LEVELS[95]
EXP = int(LEVEL['normal_enemy_base_exp'] * RUNTIME_EXP['roles']['field_boss']
          * RUNTIME_EXP['gap']['player_higher_by_over_40'] + .5)
HOME = SPEC['home']


def prepare(lua, core, state, node, accepted):
    core.grantExp(state, SHIELD_LEVEL['maple_reference_total_exp_to_reach'], 'quest')
    core.enterStoryNode(state, 'fontaine-hub')
    core.enterStoryNode(state, HUB)
    if accepted:
        core.action(state, 'story_accept:'+QUEST)
        assert state.story.quests[QUEST].status == 'active'
    configured, message = core.configure(state, lua.table_from([['SK20']]+[[] for _ in range(7)], recursive=True))
    assert configured, message
    core.enterStoryNode(state, node)


def hurt(state, since):
    return [(e.value,e.element) for e in state.events.values()
            if e.seq>since and e.kind=='hurt' and e.target==ENTITY]


def shield(core, state, hp):
    actor = state.actors[1]
    assert core.attack(state, actor, 'SK20')
    barrier = actor.waterShield
    barrier.hp = hp
    return barrier


def party(lua, core, accepted=False):
    state = core.new(12)
    core.action(state, 'story_start')
    prepare(lua, core, state, ARENA, accepted)
    place(state, HOME-104)
    return state


def share(lua, core):
    states = [party(lua,core,i==0) for i in range(4)]
    room = core.newCoop(states[0])
    for state in states:
        core.attachCoop(room,state)
    return room,states,lambda:core.stepCoop(room,TICK)


def check_lua():
    lua,core = runtime()
    room,states,step = share(lua,core)
    host,guest,unshielded,jumper = states
    slot = room.fieldSlot
    boss = slot.enemy
    assert boss.maxhp == 970 and boss.element == 'hydro'
    place(unshielded, HOME+110)
    place(jumper, HOME+215)
    wait_cast(step,slot,'FV01',89)
    assert [hurt(s,0) for s in states] == [[(13,'physical')]]*2+[[],[]]
    wait_cast(step,slot,'FV01',149)
    assert [hurt(s,0) for s in states[:2]] == [[(13,'physical')]*2]*2
    wait_cast(step,slot,'FV02',113)
    assert [hurt(s,0) for s in states[2:]] == [[(17,'physical')],[]]

    wait_cast(step,slot,'FV03',131)
    cast = slot.cast
    for state,dx in zip(states,(-96,98,-144,122)):
        place(state,boss.x+dx)
    jumper.actors[1].y, jumper.actors[1].ground = 388,False
    host_barrier = shield(core,host,40)
    shield(core,guest,5)
    mark = [s.seq for s in states]
    step()
    assert host_barrier.hp==18 and guest.actors[1].waterShield is None
    assert [hurt(s,seq) for s,seq in zip(states,mark)] == [[],[(17,'hydro')],[(22,'hydro')],[]]
    assert cast.guardTick==132 and cast.total==348
    for state,seq in zip(states[:2],mark):
        assert any(e.seq>seq and e.kind=='hit' and e.target==ENTITY and e.actor==1 and e.value>0
                   for e in state.events.values())
    place(jumper,boss.x+154)
    wait_cast(step,slot,'FV03',143)
    assert [hurt(s,seq) for s,seq in zip(states,mark)] == [[],[(17,'hydro')],[(22,'hydro')],[(22,'hydro')]]
    wait_cast(step,slot,'FV03',288)
    for state in states:
        view=core.frame(state).fieldBoss
        assert view.guardTick==132 and view.recoveryTicks==60 and view.label=='盾で受けた・隙＋1秒'
    wait_cast(step,slot,'FV03',347)
    step()
    assert slot.cast is None
    assert attack(lua,core,guest,boss,x=boss.x,atk=5000)>0 and slot.phase=='respawn'
    assert [(s.kills,s.mora,s.progression.killXp) for s in states] == [(1,165,EXP)]*2+[(0,0,0)]*2
    assert host.story.quests[QUEST].count==1 and guest.story.quests[QUEST] is None
    core.stepCoop(room,TICK)
    assert slot.enemy.element=='hydro'
    for _ in range(3599):
        core.stepCoop(room,TICK)
    assert slot.generation==2 and slot.enemy.element=='pyro' and slot.enemy.hp==970
    assert all(core.frame(s).fieldBoss.element=='pyro' for s in states)

    solo,newcomer = party(lua,core),party(lua,core)
    live = solo.fieldSlots[BOSS]
    wait_cast(lambda:core.step(solo,TICK),live,'FV01',84)
    assert hurt(solo,0)==[(13,'physical')]
    adopted = core.newCoop(solo)
    for state in (solo,newcomer):
        core.attachCoop(adopted,state)
        place(state,live.enemy.x-96)
    mark = solo.seq
    core.stepCoop(adopted,TICK)
    assert hurt(solo,mark)==[] and hurt(newcomer,0)==[(13,'physical')]

    room,states,step = share(lua,core)
    host,guest,*_ = states
    slot = room.fieldSlot
    boss = slot.enemy
    wait_cast(step,slot,'FV03',131)
    for state in states:
        place(state,boss.x-96)
    ignored = shield(core,host,40)
    host.actors[1].inv = 1
    shield(core,guest,40)
    boss.hp = 1
    cast = slot.cast
    step()
    assert ignored.hp==40 and cast.guardTick is None
    assert boss.hp==0 and slot.cast is None and slot.phase=='respawn'
    assert [s.kills for s in states]==[0,1,0,0]
    return {'participants':4,'hp':970,'clawAndTailPerTraveler':True,
            'jumpAvoidsShowerUntilLanding':True,'partialAndFullShieldsArePersonal':True,
            'bothShieldCountersCreditTheirOwners':True,'extraRecoveryTicks':60,
            'soloHitHistorySurvivesAdoption':True,'lethalShieldCounterClosesCast':True,
            'respawnElementAtGenerationTwo':'pyro','xpPerContributor':EXP,'moraPerContributor':165}


def check_http(url):
    clients = [Client(url),Client(url)]
    for i,client in enumerate(clients):
        client.frame(['story_start'])
        with LOCK:
            env = SESSIONS[client.sid]
            prepare(env['lua'],env['core'],env['state'],ENTRY,i==0)
    code = clients[0].frame(['coop_create'])['coop']['code']
    assert clients[1].frame(['coop_join:'+code])['coop']['code']==code
    for client in clients:
        assert cross(client,1270,ARENA)['coop']['code']==code
    with LOCK:
        h,g = [SESSIONS[c.sid] for c in clients]
        lua,core = h['lua'],h['core']
        world = h['coop_room'].worlds[ARENA]
        slot = world.fieldSlot
        boss = slot.enemy
        for env in (h,g):
            place(env['state'],boss.x-104)
        wait_cast(lambda:core.stepCoop(world,TICK),slot,'FV03',108)
        for env,dx in zip((h,g),(-100,100)):
            place(env['state'],boss.x+dx)
    # The guest uses the fixture's equipped shield through the usual action.
    clients[1].frame(['slot1'])
    with LOCK:
        wait_cast(lambda:core.stepCoop(world,TICK),slot,'FV03',168)
        assert slot.cast.guardTick==132
    for client in clients:
        view = client.frame()['fieldBoss']
        assert view['guardTick']==132 and view['recoveryTicks']>120
        assert cross(client,65,ENTRY)['coop']['code']==code
    frozen = world.tick,slot.cast.tick,slot.cast.guardTick,slot.cast.total
    advance(*clients,.2)
    assert (world.tick,slot.cast.tick,slot.cast.guardTick,slot.cast.total)==frozen
    for client in clients:
        assert cross(client,1270,ARENA)['coop']['code']==code
    with LOCK:
        for env in (h,g):
            place(env['state'],boss.x-98)
        assert attack(lua,core,h['state'],boss,x=boss.x,atk=5000)>0
    for i,client in enumerate(clients):
        save = client.frame(checkpoint=True)['checkpoint']
        assert save['mora']==165 and save['progression']['killXp']==EXP
        assert save['endgame']['bosses'][BOSS]['clears']==1
        respawn = save['fieldBosses'][BOSS]
        assert respawn['generation']==1 and respawn['hp']==0 and respawn['waitTicks']>0
        if i==0:
            assert save['story']['quests'][QUEST]['count']==1
        else:
            assert QUEST not in save['story']['quests']
    return {'participants':2,'guestShieldExtendsBothViews':True,'recoveryPausedWhileEmpty':True,
            'shieldCounterEarnsCreditWithoutManualAttack':True,'personalQuestCreditAndRewardsSaved':True}


if __name__=='__main__':
    result={'lua':check_lua()}
    with lab() as url:
        result['http']=check_http(url)
    (ROOT/'evidence/coop-primo-field-lua-http.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
    print(json.dumps(result))
