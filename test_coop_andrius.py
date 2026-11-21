"""Check the shared Wolf trial, split difficulty rooms and personal ranked rewards."""
import json

from experience import LEVELS, RUNTIME_EXP, resolve_weekly_rewards
from runtime import ROOT, native, runtime
from savegame import validate_save
from test_coop_anemo import TICK, place, wait_cast
from test_coop_local import Client, LOCK, SESSIONS, advance, lab
from test_coop_travel import cross


BOSS, ENTITY = 'boss-29020101', 29020101
TOWN, ROAD, ARENA = 'mond-town', 'mond-road', 'andrius-wolf-ring'
QUEST = 'andrius-weekly-commission'
RANK, RANK_KEY = 'entry', BOSS + ':entry'
SPEC = next(s for s in json.loads((ROOT/'content/weekly-boss-spawns.json').read_text(
    encoding='utf8'))['weeklyBosses'] if s['id'] == BOSS)
MODE = resolve_weekly_rewards([SPEC])[0]['modes'][0]
EXP = LEVELS[SPEC['level'] - 1]['normal_enemy_base_exp'] * RUNTIME_EXP['roles']['weekly_boss']


def prepare(core, state, level, accepted=False):
    core.grantExp(state, LEVELS[level - 1]['maple_reference_total_exp_to_reach'], 'quest')
    core.enterStoryNode(state, TOWN)
    if accepted:
        core.action(state, 'story_accept:' + QUEST)
        assert state.story.quests[QUEST].status == 'active'


def party(core, accepted=False):
    state = core.new(12)
    core.action(state, 'story_start')
    prepare(core, state, SPEC['level'], accepted)
    core.enterStoryNode(state, ARENA)
    place(state, 380)
    return state


def position(states, *positions):
    for state, point in zip(states, positions):
        actor = state.actors[1]
        actor.hp = actor.maxhp
        x, y = point if isinstance(point, tuple) else (point, 480)
        place(state, x)
        actor.y = y


def strike(lua, core, state, enemy, power, element='physical'):
    cast = lua.table_from(dict(id=1, atk=power, x=enemy.x, y=480, dir=1, radial=True,
                               range=48, limit=1, mult=1, gain=0, color='#74ddff',
                               element=element, critRate=0))
    core.resolveCast(state, cast)


def force_move(lua, slot, name, direction=1):
    move = SPEC['moves'][name]
    enemy = slot.primary
    slot.phase = 'combat'
    slot.cast = lua.table_from(dict(move=move, tick=0, origin=enemy.x, originY=enemy.y,
                                    dir=direction, variant='melee', total=move['total'],
                                    seen=[{}, {}, {}], counts={}, bolts={}), recursive=True)


def damage_since(state, mark):
    return [e.value for e in state.events.values()
            if e.seq > mark and e.kind == 'hurt' and e.target == ENTITY]


def measured(states):
    marks = [s.seq for s in states]
    return lambda:[damage_since(s, mark) for s, mark in zip(states, marks)]


def reach_interlude(lua, core, states, slot, step, power):
    enemy = slot.primary
    wait_cast(step, slot, 'WA01', 70)
    for state in states[:2]:
        strike(lua, core, state, enemy, power)
    assert 0 < enemy.hp <= 450
    hp = enemy.hp
    step()
    assert slot.transitionPending and slot.transitions == 0 and slot.cast.move.id == 'WA01'
    wait_cast(step, slot, 'WA06', 1)
    assert slot.transitions == 1 and enemy.underground
    strike(lua, core, states[0], enemy, 10000)
    assert enemy.hp == hp


def check_lua(lua, core):
    states = [party(core, i == 0) for i in range(4)]
    host, guest, high, safe = states
    host.t, guest.t, high.t = 220, 4, 950
    room = core.newCoop(host)
    for state in states:
        core.attachCoop(room, state)
    slot, step = room.weeklySlot, lambda:core.stepCoop(room, TICK)
    enemy = slot.primary
    assert enemy.hp == enemy.maxhp == 900 and len(room.enemies) == 1
    assert len(core.coopFrame(host).enemies) == 1
    strike(lua, core, guest, enemy, 200, 'anemo')
    strike(lua, core, host, enemy, 200, 'cryo')
    assert enemy.hp == 900 and enemy.coopHits is None

    position(states, 373, 350, (128,356.8), 680)
    hits = measured(states)
    reach_interlude(lua,core,states,slot,step,275)
    assert hits() == [[20], [20], [], []]
    position(states, 400, 535, (128,356.8), (832,356.8))
    hits = measured(states)
    wait_cast(step, slot, 'WA06', 503)
    assert hits() == [[20,20,24], [20,20,24], [], []]
    assert all(core.frame(s).weeklyBoss.awakened and core.frame(s).weeklyBoss.tick == 503 for s in states)
    assert enemy.underground
    step()
    assert not enemy.underground

    position(states, 800, 802, (810,356.8), 170)
    hits = measured(states)
    wait_cast(step, slot, 'WA07', 168)
    assert hits() == [[20], [20], [], []] and slot.stage == 'P2' and slot.transitions == 1

    position(states, 800, 806, (807,356.8), 170)
    force_move(lua, slot, 'WA08')
    hits = measured(states)
    wait_cast(step, slot, 'WA08', 342)
    assert hits() == [[18,18], [18,18], [18], []], hits()
    assert len(slot.cast.bolts) == 3

    position(states, 430, 420, (128,356.8), 800)
    force_move(lua, slot, 'WA09')
    wait_cast(step, slot, 'WA09', SPEC['moves']['WA09']['lock'])
    position(states, 64, 70, (128,356.8), 800)
    hits = measured(states)
    wait_cast(step, slot, 'WA09', 196)
    assert hits() == [[8,8], [8,8], [], []] and len(slot.hazards) == 2

    position(states, enemy.x-60, enemy.x+60, 128, 810)
    strike(lua, core, host, enemy, 20)
    strike(lua, core, guest, enemy, 10000)
    assert slot.phase == 'respawn' and slot.cast is None and not len(slot.hazards)
    assert [s.kills for s in states] == [1,1,0,0]
    assert [(s.progression.killXp,s.mora) for s in states[:2]] == [(EXP,330)]*2
    assert host.story.quests[QUEST].count == 1 and guest.story.quests[QUEST] is None
    for state in states[:2]:
        assert state.endgame.bosses[BOSS].clears == 1
        save = validate_save(native(core.checkpoint(state)))
        assert save['weeklyBosses'][BOSS]['hp'] == 0 and save['weeklyBosses'][BOSS]['waitTicks'] == 3600

    states = [party(core), party(core)]
    room = core.newCoop(states[0])
    for state in states:
        core.attachCoop(room,state)
    slot = room.weeklySlot
    strike(lua,core,states[0],slot.primary,10000)
    core.stepCoop(room,TICK)
    assert slot.phase == 'respawn' and slot.transitions == 0 and states[0].kills == 1


def check_adoption(lua,core):
    host,guest = party(core),party(core)
    slot = host.weeklySlots[BOSS]
    step = lambda:core.step(host,TICK)
    force_move(lua,slot,'WA09')
    wait_cast(step,slot,'WA09',131)
    position([host,guest],64,70)
    step()
    assert damage_since(host,0) == [8]
    room = core.newCoop(host)
    for state in (host,guest):
        core.attachCoop(room,state)
    hits = measured([host,guest])
    core.stepCoop(room,TICK)
    assert hits() == [[],[8]]


def choose_rank(client):
    with LOCK:
        place(SESSIONS[client.sid]['state'],940)
    frame = client.frame([f'weekly_start:{BOSS}:{RANK}'])
    assert frame['story']['node'] == ARENA and frame['weeklyBoss']['difficulty'] == MODE['name']
    return frame


def checked_party(client):
    return SESSIONS[client.sid]['state']


def check_http(url):
    host,guest,other = [Client(url) for _ in range(3)]
    for index,client in enumerate((host,guest,other)):
        client.frame(['story_start'])
        with LOCK:
            env = SESSIONS[client.sid]
            prepare(env['core'],env['state'],MODE['level'] if index<2 else SPEC['level'],index==0)
            if index==1:
                env['core'].recordWeeklyClear(env['state'],BOSS,RANK,env['state'].t)
        cross(client,1380,ROAD)
    code = host.frame(['coop_create'])['coop']['code']
    choose_rank(host)
    # Joining from a ranked solo arena must preserve the difficulty across Lua runtimes.
    choose_rank(guest)
    joined = guest.frame(['coop_join:' + code])
    assert joined['weeklyBoss']['difficulty'] == MODE['name'] and joined['coop']['peers'][0]['actors']
    other.frame(['coop_join:' + code])
    with LOCK:
        place(checked_party(other),940)
    denied = other.frame([f'weekly_start:{BOSS}:{RANK}'])
    assert denied['story']['node'] == ROAD and not denied['weeklyDesk']['modes'][0]['available']
    cross(other,940,ARENA)
    separated = other.frame()
    assert 'difficulty' not in separated['weeklyBoss']
    assert all(not p['actors'] for p in separated['coop']['peers'])

    with LOCK:
        env=SESSIONS[host.sid]
        lua,core=env['lua'],env['core']
        room=env['coop_room']
        ranked,normal=room.worlds[(ARENA,RANK)],room.worlds[ARENA]
        slot=ranked.weeklySlot
        states=[checked_party(host),checked_party(guest)]
        position(states,373,350)
        step=lambda:core.stepCoop(ranked,TICK)
        reach_interlude(lua,core,states,slot,step,225)
        wait_cast(step,slot,'WA06',120)
        hp=slot.primary.hp
        assert normal.weeklySlot.primary.hp==900

    for client in (host,guest):
        frame=client.frame()
        assert frame['weeklyBoss']['stage']=='INTERLUDE'
        assert frame['coop']['enemies']==[{'id':ENTITY,'hp':hp,'maxhp':900}]
        assert cross(client,35,ROAD)['coop']['code']==code
    frozen=(ranked.tick,slot.cast.tick)
    advance(host,other,.2)
    assert (ranked.tick,slot.cast.tick)==frozen
    for client in (host,guest):
        assert choose_rank(client)['weeklyBoss']['hp']==hp
    with LOCK:
        position(states,(128,356.8),(832,356.8))
        wait_cast(step,slot,'WA06',504)
        position(states,415,545)
        strike(lua,core,states[0],slot.primary,20)
        strike(lua,core,states[1],slot.primary,10000)

    rewards=[]
    for index,client in enumerate((host,guest)):
        first=index==0
        frame=client.frame(checkpoint=True)
        save=frame['checkpoint']
        xp=MODE['xp']+(MODE['firstXp'] if first else 0)
        mora=MODE['mora']+(MODE['firstMora'] if first else 0)
        assert frame['weeklyBoss']['reward']==dict(xp=xp,mora=mora,first=first)
        assert save['weeklyBosses'][BOSS]['hp']==0 and save['weeklyBosses'][BOSS]['waitTicks']>0
        assert save['endgame']['weekly'][RANK_KEY]['clears']==index+1
        assert save['progression']['killXp']==xp and save['mora']==mora
        assert (save['story']['quests'].get(QUEST) or {}).get('count')==(1 if first else None)
        rewards.append(dict(first=first,xp=xp,mora=mora,clears=index+1))
    assert other.frame()['weeklyBoss']['hp']==900 and other.frame()['kills']==0
    return dict(participants=3, rank=RANK, underlevelEntryRejection=True, rankedAndStoryWorldsSeparate=True,
                rankedJoinMigration=True, emptyInterludePreserved=True, personalRankRewards=rewards)


if __name__=='__main__':
    lua,core=runtime()
    check_lua(lua,core)
    check_adoption(lua,core)
    del lua,core
    result={'lua':dict(participants=4, oneInterlude=True, individualRushAndLanding=True,
                       independentBladeCapsAndHazards=True, adoptedColdFloorCooldown=True,
                       realHeightSafety=True, individualRewards=True, lethalHitPrecedesInterlude=True)}
    with lab() as url:
        result['http']=check_http(url)
    (ROOT/'evidence/coop-andrius-lua-http.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
    print(result)
