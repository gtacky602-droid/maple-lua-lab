"""Exercise the shared Regisvine nucleus, cast windows and save state."""
import json

from experience import LEVELS, RUNTIME_EXP
from runtime import ROOT, runtime
from test_coop_anemo import TICK, place, wait_cast
from test_coop_local import Client, LOCK, SESSIONS, advance, lab
from test_coop_sumeru_field import attack
from test_coop_travel import cross

ID, ENTITY = 'boss-26020101', 26020101
ARENA, ENTRY, QUEST = 'cryo-field-grove', 'cryo-approach', 'cryo-commission'
EXP = LEVELS[15]['normal_enemy_base_exp'] * RUNTIME_EXP['roles']['field_boss']


def prepare(core, state, world, accept):
    core.grantExp(state, LEVELS[15]['maple_reference_total_exp_to_reach'], 'quest')
    if accept:
        core.action(state, 'story_accept:'+QUEST)
    core.enterStoryNode(state, world)


def hurt(state, after):
    return [v.value for v in state.events.values() if v.seq > after and
            v.target == ENTITY and v.kind == 'hurt']


def check_lua():
    lua, core = runtime()

    def player(accept=False):
        state = core.new(12)
        core.action(state, 'story_start')
        prepare(core, state, ARENA, accept)
        place(state, 720)
        return state

    states = host, guest, observer, spectator = player(True), player(), player(), player()
    room = core.newCoop(host)
    for state in states:
        core.attachCoop(room, state)
    slot, step = room.fieldSlot, lambda: core.stepCoop(room, TICK)
    boss = slot.enemy
    assert boss.maxhp == 570 and boss.coreHits == 3
    place(observer, 880)
    place(spectator, 510)
    wait_cast(step, slot, 'FC01', 83)
    assert [hurt(s, 0) for s in states] == [[15], [15], [], []]
    wait_cast(step, slot, 'FC02', 95)
    assert [hurt(s, 0) for s in states] == [[15, 11], [15, 11], [], []]
    wait_cast(step, slot, 'FC03', 36)
    for s, x in zip(states, (605, 565, 880, 510)):
        place(s, x)
    before = [s.seq for s in states]
    wait_cast(step, slot, 'FC03', 95)
    host.actors[1].inv = 0
    wait_cast(step, slot, 'FC03', 120)
    assert slot.cast.shots[1] and slot.cast.shots[2]
    assert [hurt(s, seq) for s, seq in zip(states, before)] == [[9, 9], [], [], []]

    place(host,720)
    place(guest,725)
    place(observer,910)
    wait_cast(step, slot, 'FC01', 60)
    probe = lua.table(id=1,x=720,y=480,range=125,radial=True,limit=1,atk=10,mult=1,
                      critRate=0,color='#fff',element='physical',gain=0)
    for _ in range(2):
        core.resolveCast(host, probe)
    assert boss.coreHits == 2
    assert attack(lua, core, guest, boss, x=880, range=125) > 0
    assert all(core.frame(s).fieldBoss.coreHits == 1 for s in states[:3])
    assert attack(lua, core, host, boss, x=720, range=125) > 0
    assert boss.coreHits == 0 and boss.down == 0
    wait_cast(step, slot, 'FC01', 83)
    step()
    assert slot.cast is None and all(core.frame(s).fieldBoss.downTicks == 240 for s in states[:3])
    assert attack(lua, core, guest, boss, x=880, range=125, atk=2000) > 0
    assert slot.phase == 'respawn'
    assert [(s.kills, s.mora, s.progression.killXp) for s in states] == [(1,125,EXP)]*2+[(0,0,0)]*2
    assert host.story.quests[QUEST].count == 1 and guest.story.quests[QUEST] is None

    solo, newcomer = player(), player()
    personal = solo.fieldSlots[ID]
    wait_cast(lambda: core.step(solo,TICK), personal, 'FC01', 72)
    assert hurt(solo, 0) == [15]
    adopted = core.newCoop(solo)
    for state in (solo,newcomer):
        core.attachCoop(adopted,state)
        place(state,720)
    before = solo.seq
    core.stepCoop(adopted,TICK)
    assert hurt(solo,before) == [] and hurt(newcomer,0) == [15]
    return {'participants':4,'hp':570,'sharedCoreAndDown':True,'separateMeleeContacts':True,
            'iceBoltsStopOnFirstContact':True,'soloCastHistorySurvivesAdoption':True,
            'xpPerContributor':EXP,'moraPerContributor':125}


def check_http(url):
    clients = [Client(url),Client(url)]
    for i,client in enumerate(clients):
        client.frame(['story_start'])
        with LOCK:
            env = SESSIONS[client.sid]
            prepare(env['core'], env['state'], ENTRY, i==0)
    code = clients[0].frame(['coop_create'])['coop']['code']
    assert clients[1].frame(['coop_join:'+code])['coop']['code'] == code
    for client in clients:
        assert cross(client,1270,ARENA)['coop']['code'] == code
    with LOCK:
        h,g = [SESSIONS[c.sid] for c in clients]
        lua,core = h['lua'],h['core']
        world = h['coop_room'].worlds[ARENA]
        slot = world.fieldSlot
        boss = slot.enemy
        for env in (h,g):
            place(env['state'],720)
            assert attack(lua,core,env['state'],boss,x=720,range=125) > 0
        assert attack(lua,core,h['state'],boss,x=720,range=125) > 0
        assert boss.coreHits == 0
        for _ in range(180):
            core.stepCoop(world,TICK)
            if boss.down == 240:
                break
        assert boss.down == 240
    for client in clients:
        assert client.frame()['fieldBoss']['downTicks'] > 0
        assert cross(client,65,ENTRY)['coop']['code'] == code
    frozen = world.tick,boss.down
    advance(*clients,.2)
    assert (world.tick,boss.down) == frozen
    for client in clients:
        assert cross(client,1270,ARENA)['coop']['code'] == code
    with LOCK:
        for env in (h,g):
            place(env['state'],720)
        assert attack(lua,core,g['state'],boss,x=720,range=125,atk=2000) > 0
    for i,client in enumerate(clients):
        frame=client.frame(checkpoint=True)
        save=frame['checkpoint']
        assert frame['kills'] == 1 and save['mora'] == 125 and save['progression']['killXp'] == EXP
        assert save['endgame']['bosses'][ID]['clears'] == 1
        assert save['fieldBosses'][ID]['hp'] == 0 and save['fieldBosses'][ID]['waitTicks'] > 0
        if i==0:
            assert save['story']['quests'][QUEST]['count'] == 1
        else:
            assert QUEST not in save['story']['quests']
    return {'participants':2,'downPausedWhileEmpty':True,'sameRoomRejoin':True,
            'personalQuestCreditAndRewardsSaved':True}


if __name__=='__main__':
    result={'lua':check_lua()}
    with lab() as url:
        result['http']=check_http(url)
    (ROOT/'evidence/coop-cryo-field-lua-http.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
    print(json.dumps(result))
