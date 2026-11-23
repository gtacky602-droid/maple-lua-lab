"""Check the shared Moon Crab fight and each party's chapter gates."""
import json
import subprocess
import sys

from experience import CHAPTER_CLEAR_EXP, LEVELS, QUEST_REPORT_EXP, RUNTIME_EXP
from runtime import ROOT, native, runtime
from savegame import validate_save
from test_coop_branch_legends import SPECS, actor_at, damage, hit, run_until
from test_coop_local import Client, LOCK, SESSIONS, advance, lab
from test_coop_travel import cross


BOSS, QUEST = 'original-moon-crab', 'nod-moon-vault-quest'
TOWN, MOUTH, ARENA, VAULT = 'nod-town', 'nod-moon-cave-mouth', 'nod-moon-crab-arena', 'nod-moon-vault'
SPEC = SPECS[BOSS]
CHAPTER_EXP = CHAPTER_CLEAR_EXP['Q-NOD-M03:BOSS_FIRST']
REPORT_EXP = QUEST_REPORT_EXP['Q-NOD-M03']
KILL_EXP = int(LEVELS[119]['normal_enemy_base_exp']*RUNTIME_EXP['roles']['field_boss']+.5)
TICK = 1/60


def move(core, state, x, node):
    actor_at(state, x)
    core.action(state, 'story_portal:'+node)
    assert state.story.node == node


def inspect(core, state, x):
    actor_at(state, x)
    core.action(state, 'story_collect')


def checkpoint(core, state):
    return validate_save(native(core.checkpoint(state)))


def shared_casts(seed):
    lua, core = runtime()
    players = [core.restore(lua.table_from(seed, recursive=True), 12) for _ in range(4)]
    host, guest, watcher, leaving = players
    for state in players:
        core.action(state, 'story_accept:'+QUEST)
        move(core, state, 1258, MOUTH)
        inspect(core, state, 1080)
        move(core, state, 1260, ARENA)
        state.actors[2].hp = 0
        actor_at(state, 840)
    slot = host.fieldSlots[BOSS]
    solo_step = lambda: core.step(host, TICK, lua.table())
    run_until(solo_step, lambda: slot.cast and slot.cast.tick == slot.cast.move.windup-1)
    claw = slot.cast
    assert claw.move.id == 'claw'
    center = (claw.left+claw.right)/2
    actor_at(host, center)
    solo_step()
    assert damage(host) == [(SPEC['entity'], claw.move.damage)]
    host.actors[1].inv = 0

    room = core.newCoop(host)
    members = [core.attachCoop(room, state) for state in players]
    step = lambda: core.stepCoop(room, TICK)
    actor_at(guest, center)
    actor_at(watcher, center, 384)
    actor_at(leaving, claw.left-40)
    step()
    assert [len(damage(s)) for s in players] == [1,1,0,0]
    assert all(core.frame(s).fieldBoss.hp == 228 for s in players)
    for state in players:
        actor_at(state, slot.enemy.x-150)

    run_until(step, lambda: slot.cast and slot.cast.move.id == 'box')
    box = slot.cast
    left, right = box.left, box.right
    run_until(step, lambda: box.tick == box.move.windup-1)
    actor_at(host, (left+right)/2, 384)
    actor_at(guest, right+28)
    actor_at(watcher, right+62)
    actor_at(leaving, left-30)
    before = [len(damage(s)) for s in players]
    run_until(step, lambda: box.tick == box.move.windup)
    assert [len(damage(s))-n for s,n in zip(players,before)] == [1,0,0,0]
    assert all((core.frame(s).fieldBoss.lane.left,core.frame(s).fieldBoss.lane.right) == (left,right)
               for s in players)

    crab = slot.enemy
    hit(lua, core, guest, crab, power=123)
    assert 0 < crab.hp <= 114
    step()
    assert slot.cast.move.id == 'shell-break'
    assert all(core.frame(s).fieldBoss.cracked and core.frame(s).fieldBoss.hp == crab.hp for s in players)
    for state in players:
        actor_at(state, crab.x-155)

    run_until(step, lambda: slot.cast and slot.cast.move.id == 'reflection')
    reflection = slot.cast
    width = (reflection.right-reflection.left)/3
    before = [len(damage(s)) for s in players]
    for i in range(3):
        run_until(step, lambda: reflection.tick == reflection.move.windup+i*reflection.move.interval-1)
        for j,state in enumerate(players):
            x = reflection.origin+reflection.dir*(min(j,2)+.5)*width
            actor_at(state, x, 384 if j==3 else 480).inv = 0
        step()
        assert [len(damage(s))-n for s,n in zip(players,before)] == [int(j<=i) for j in range(3)]+[0]

    for state in players:
        actor_at(state, crab.x)
    hit(lua, core, leaving, crab, power=8)
    move(core, leaving, 65, MOUTH)
    core.detachCoop(members[3])
    hit(lua, core, guest, crab, power=8)
    hit(lua, core, host, crab, power=1000)
    assert [s.story.quests[QUEST].count for s in players] == [2,2,1,1]
    assert [s.mora for s in players] == [730,730,0,0]
    assert [s.progression.killXp for s in players] == [KILL_EXP,KILL_EXP,0,0]

    for state,member,choice,x in zip(players[:2],members,('feather','flower'),(657,803)):
        assert (state.progression.questXp == seed['progression']['questXp']+CHAPTER_EXP)
        assert checkpoint(core,state)['endgame']['bosses'][BOSS]['clears'] == 1
        move(core,state,1731,VAULT)
        core.detachCoop(member)
        inspect(core,state,416)
        inspect(core,state,x)
        inspect(core,state,1460-x)
        assert state.story.quests[QUEST].storyChoice == choice
        assert (state.inventory.upgradeOre,state.mora) == (8,15230)
        move(core,state,1430,TOWN)
        for _ in range(2):
            core.action(state,'story_report:'+QUEST)
        assert state.progression.questXp == seed['progression']['questXp']+CHAPTER_EXP+REPORT_EXP
        restored = core.restore(lua.table_from(checkpoint(core,state),recursive=True),12)
        assert restored.story.quests[QUEST].storyChoice == choice
    return dict(players=4, hp=228, noRepeatedHitOnJoin=True, sharedBox=True, sharedCrackedForm=True,
                reflectionBands=3, rewardedPlayers=2, expPerContributor=KILL_EXP, moraPerContributor=730,
                individualCacheChoices=['feather','flower'], chapterExp=CHAPTER_EXP, reportExp=REPORT_EXP)


def http_match(url, seed):
    host, guest = Client(url), Client(url)
    host.frame(restore=seed)
    guest.frame(restore=seed)
    for client in (host,guest):
        client.frame(['story_accept:'+QUEST])
        cross(client,1258,MOUTH)
        with LOCK:
            SESSIONS[client.sid]['state'].actors[2].hp = 0
    code = host.frame(['coop_create'])['coop']['code']
    assert guest.frame(['coop_join:'+code])['coop']['code'] == code
    for client in (host,guest):
        with LOCK:
            actor_at(SESSIONS[client.sid]['state'],1260)
        f = client.frame(['story_portal:'+ARENA])
        assert f['story']['node'] == MOUTH and not f['storyNearbyPortal']['available']
        with LOCK:
            actor_at(SESSIONS[client.sid]['state'],1080)
        assert client.frame(['story_collect'])['story']['quests'][QUEST]['count'] == 1
        assert cross(client,1260,ARENA)['coop']['shared']

    with LOCK:
        env = SESSIONS[host.sid]
        lua, core = env['lua'],env['core']
        first, second = [SESSIONS[c.sid]['state'] for c in (host,guest)]
        room = first.coop
        crab = room.fieldSlot.enemy
        actor_at(first,crab.x-65).atk = 130
        first.actors[1].dir = 1
    host.frame(['normal'])
    frames = advance(host,guest,.45)
    hp = frames[0]['fieldBoss']['hp']
    assert 0 < hp < 228 and frames[1]['fieldBoss']['hp'] == hp
    for client in (host,guest):
        cross(client,65,MOUTH)
    paused = room.tick
    advance(host,guest,.15)
    assert room.tick == paused
    for client in (host,guest):
        assert cross(client,1260,ARENA)['fieldBoss']['hp'] == hp
    with LOCK:
        actor_at(first,crab.x)
        finishing_x=first.actors[1].x
        hit(lua,core,first,crab,power=1000)
    finished,_ = advance(host,guest,.08)
    assert finished['story']['quests'][QUEST]['count'] == 2
    assert not finished['coop']['shared'] and finished['storyFirstClear']['xp'] == CHAPTER_EXP
    assert abs(finished['actors'][0]['x']-finishing_x)<1
    assert guest.frame()['story']['quests'][QUEST]['count'] == 1
    cross(host,1731,VAULT)
    private = cross(host,64,ARENA)
    assert private['coop']['code'] == code and not private['coop']['shared']
    assert not private['coop']['eligible'] and not private.get('fieldBoss')
    assert guest.frame()['coop']['shared']
    with LOCK:
        remaining = round((room.fieldSlot.waitUntil-room.time)/TICK)
        assert SPEC['respawnTicks']-120 <= remaining <= SPEC['respawnTicks']
        tick_room = lua.eval('function(C,room,dt,n) for _=1,n do C.stepCoop(room,dt) end end')
        tick_room(core,room,TICK,remaining-2)
        assert room.fieldSlot.enemy.hp == 0
        tick_room(core,room,TICK,3)
        assert room.fieldSlot.enemy.hp == 228 and not room.fieldSlot.enemy.cracked
    assert not host.frame()['coop']['shared']
    saved = validate_save(host.frame(checkpoint=True)['checkpoint'])
    assert saved['endgame']['bosses'][BOSS]['clears'] == 1
    inactive = host.frame(['coop_leave','coop_create'])['coop']
    assert not inactive['eligible'] and 'code' not in inactive
    cross(host,1731,VAULT)
    for x in (416,657):
        with LOCK:
            actor_at(first,x)
        host.frame(['story_collect'])
    cross(host,1430,TOWN)
    reported=host.frame(['story_report:'+QUEST])
    assert reported['story']['quests'][QUEST]['status'] == 'complete'
    assert host.frame(['coop_join:'+code])['coop']['code'] == code
    cross(host,1258,MOUTH)
    assert cross(host,1260,ARENA)['coop']['shared']
    with LOCK:
        first = SESSIONS[host.sid]['state']
        crab = room.fieldSlot.enemy
        actor_at(first,crab.x)
        hit(lua,core,first,crab,power=1000)
    rematch=host.frame(checkpoint=True)
    assert rematch['checkpoint']['endgame']['bosses'][BOSS]['clears'] == 2
    assert rematch['progression']['questXp'] == reported['progression']['questXp']
    assert rematch['mora'] == reported['mora']+730
    return dict(players=2, personalEntry=True, ordinaryInputsShareHP=True, retreatRetainsHP=True,
                victoryRetainsPositionAndBanner=True, preReportReturnIsPrivate=True,
                sameRoomRespawn=True, reportedPlayerCanRejoinWithoutDuplicateChapterReward=True)


if __name__ == '__main__':
    subprocess.run([sys.executable, str(ROOT/'test_nod_moon_vault.py')], check=True)
    fixture = json.loads((ROOT/'work/nod-moon-vault-fixture.json').read_text(encoding='utf8'))
    result = dict(lua=shared_casts(fixture))
    with lab() as url:
        result['http'] = http_match(url,fixture)
    (ROOT/'evidence/coop-moon-crab-lua-http.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
    print(result)
