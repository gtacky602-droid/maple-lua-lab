"""Exercise shared Half-Tulpa life cycles and individual rewards."""
import json

from experience import LEVELS, RUNTIME_EXP
from runtime import ROOT, native, runtime
from test_coop_anemo import TICK, place, wait_cast
from test_coop_local import Client, LOCK, SESSIONS, advance, lab
from test_coop_travel import cross


HUB, APPROACH, ARENA = 'fontaine-hub', 'fontaine-field', 'tulpa-field-grotto'
BOSS, ENTITY, QUEST = 'boss-20051201', 20051201, 'tulpa-commission'
LEVEL = LEVELS[87]
XP = LEVEL['normal_enemy_base_exp'] * RUNTIME_EXP['roles']['field_boss']


def make(core, accepted=False):
    state = core.new(12)
    core.action(state, 'story_start')
    core.grantExp(state, LEVEL['maple_reference_total_exp_to_reach'], 'quest')
    core.enterStoryNode(state, HUB)
    if accepted:
        core.action(state, 'story_accept:' + QUEST)
    core.enterStoryNode(state, ARENA)
    place(state, 758)
    return state


def attack(lua, body, power=20, element='physical'):
    return lua.table(id=1, atk=power, x=body.x, y=480, dir=1, radial=True, range=95,
                     limit=1, mult=1, color='#fff0ac', gain=0, element=element,
                     critRate=0, targetId=body.id)


def hit(lua, core, state, body, power=20, element='physical'):
    before = body.hp
    core.resolveCast(state, attack(lua,body,power,element))
    return before-body.hp


def hurt(state, seq):
    return [e.value for e in state.events.values()
            if e.seq>seq and e.kind=='hurt' and e.target==ENTITY]


def run_lua():
    lua, core = runtime()
    parties = [make(core, accepted) for accepted in (True, False, True, True)]
    room = core.newCoop(parties[0])
    for state in parties:
        core.attachCoop(room,state)
    slot, step = room.fieldSlot, lambda:core.stepCoop(room,TICK)
    boss = slot.enemy
    assert boss.maxhp==boss.hp==1030
    wait_cast(step,slot,'FHT03',54)
    cast, half = slot.cast, slot.cast.summon
    first_x = half.x
    assert half.id==-boss.id and half.hp==26 and len(room.enemies)==2
    assert all(native(core.frame(s).fieldBoss.summon)==native(core.frame(parties[0]).fieldBoss.summon)
               for s in parties)
    assert all(core.checkpoint(s).fieldBosses[BOSS].hp==1030 for s in parties)

    wait_cast(step,slot,'FHT03',84)
    assert abs(half.x-boss.x)<abs(first_x-boss.x)
    assert hit(lua,core,parties[3],half,element='hydro')==0
    assert hit(lua,core,parties[3],half)==19 and half.hp==7 and half.coopHits is None
    assert all(core.frame(s).fieldBoss.summon.hp==7 for s in parties)
    wait_cast(step,slot,'FHT03',173)
    last = attack(lua,half)
    last.remaining, last.interval, last.next = 1, .12, parties[1].t+TICK
    parties[1].pending[len(parties[1].pending)+1] = last
    step()
    assert cast.tick==174 and cast.summonStopped and cast.absorbed is None
    assert cast.summon is None and len(room.enemies)==1 and boss.hp==1030
    assert all(s.kills==s.mora==s.progression.killXp==0 for s in parties)
    assert all(core.frame(s).fieldBoss.label=='合流を阻止・小さな奔流' for s in parties)
    assert [e.target for e in parties[1].events.values() if e.kind=='object_destroyed']==[-ENTITY]
    place(parties[0],boss.x-121)
    place(parties[1],boss.x-35)
    starts = [s.seq for s in parties[:2]]
    wait_cast(step,slot,'FHT03',205)
    assert [hurt(s,seq) for s,seq in zip(parties[:2],starts)]==[[],[20]]
    place(parties[1],boss.x-102)
    assert hit(lua,core,parties[0],boss)>0
    wounded = boss.hp

    wait_cast(step,slot,'FHT01',1)
    wait_cast(step,slot,'FHT03',173)
    cast = slot.cast
    assert cast.summon.hp==26 and not cast.absorbed
    step()
    assert cast.tick==174 and cast.absorbed and boss.form=='surge'
    assert boss.hp==wounded and len(room.enemies)==1
    assert all(core.frame(s).fieldBoss.label=='合流済み・広い奔流から離れる' for s in parties)
    for s in parties[:2]:
        place(s,boss.x-121)
    starts = [s.seq for s in parties[:2]]
    wait_cast(step,slot,'FHT03',205)
    assert [hurt(s,seq) for s,seq in zip(parties[:2],starts)]==[[28],[28]]

    for s in parties:
        s.actors[1].hp=s.actors[1].maxhp
        place(s,boss.x-100)
    wait_cast(step,slot,'FHT01',1)
    wait_cast(step,slot,'FHT03',54)
    last_half = slot.cast.summon
    assert hit(lua,core,parties[3],last_half,10)>0 and last_half.hp>0
    for s in parties[:2]:
        assert hit(lua,core,s,boss)>0
    assert hit(lua,core,parties[2],boss,1600)>0
    assert last_half.hp==0 and len(room.enemies)==1 and boss.hp==0
    assert slot.phase=='respawn' and slot.cast is None
    assert not core.defeatEnemy(parties[2],boss,1)
    assert [s.kills for s in parties]==[1,1,1,0]
    assert [s.mora for s in parties]==[315,315,315,0]
    assert [s.progression.killXp for s in parties]==[XP,XP,XP,0]
    assert [parties[i].story.quests[QUEST].count for i in (0,2,3)]==[1,1,0]
    for _ in range(3599):
        step()
    assert slot.phase=='respawn'
    step()
    assert slot.generation==2 and slot.enemy.hp==1030 and len(room.enemies)==1

    solo = make(core)
    personal = solo.fieldSlots[BOSS]
    wait_cast(lambda:core.step(solo,TICK),personal,'FHT03',84)
    half = personal.cast.summon
    hit(lua,core,solo,half,10)
    adopted = core.newCoop(solo)
    core.attachCoop(adopted,solo)
    newcomer = make(core)
    core.attachCoop(adopted,newcomer)
    assert len(newcomer.enemies)==2 and core.frame(newcomer).fieldBoss.summon.hp==half.hp==17
    assert newcomer.fieldSlots[BOSS].cast is None and solo.fieldSlots[BOSS].cast is None
    return {'bossHp':1030,'summonHp':26,'fourPlayersSharePositionAndHp':True,
            'pendingHitAtMergeTickStopsAbsorption':True,'noRewardsFromHalfTulpa':True,
            'unabsorbedAndAbsorbedDamage':[20,28],'absorptionDoesNotHeal':True,
            'summonOnlyPlayerGetsNoBossCredit':True,'bossDeathCleansUpLiveSummon':True,
            'soloToRoomKeepsExistingSummon':True,'xp':XP,'mora':315,'respawnTicks':3600}


def setup_http(client, accepted):
    client.frame(['story_start'])
    with LOCK:
        env = SESSIONS[client.sid]
        env['core'].grantExp(env['state'],LEVEL['maple_reference_total_exp_to_reach'],'quest')
        env['core'].enterStoryNode(env['state'],HUB)
        env['state'].actors[2].hp = 0
    if accepted:
        assert client.frame(['story_accept:'+QUEST])['story']['quests'][QUEST]['status']=='active'
    cross(client,1380,APPROACH)
    cross(client,320,ARENA)


def run_http(url):
    host, guest = Client(url), Client(url)
    setup_http(host,True)
    setup_http(guest,False)
    code = host.frame(['coop_create'])['coop']['code']
    joined = guest.frame(['coop_join:'+code])
    slot = joined['coop']['slot']
    with LOCK:
        h, g = [SESSIONS[c.sid] for c in (host,guest)]
        core, lua = h['core'], h['lua']
        room = h['coop_room'].worlds[ARENA]
        for env in (h,g):
            place(env['state'],758)
        wait_cast(lambda:core.stepCoop(room,TICK),room.fieldSlot,'FHT03',84)
        hit(lua,core,g['state'],room.fieldSlot.cast.summon,10)
    frames = [c.frame() for c in (host,guest)]
    assert all(f['fieldBoss']['summon']['hp']==17 and len(f['coop']['enemies'])==2 for f in frames)
    for client in (host,guest):
        assert cross(client,65,APPROACH)['coop']['code']==code
    with LOCK:
        frozen_tick, frozen_x = room.tick, room.fieldSlot.cast.summon.x
    advance(host,guest,.18)
    with LOCK:
        assert room.tick==frozen_tick and room.fieldSlot.cast.summon.x==frozen_x
    cross(host,320,ARENA)
    returned = cross(guest,320,ARENA)
    assert returned['coop']['slot']==slot and returned['fieldBoss']['summon']['hp']==17
    with LOCK:
        boss, half = room.fieldSlot.enemy, room.fieldSlot.cast.summon
        for env in (h,g):
            place(env['state'],boss.x-110)
        hit(lua,core,h['state'],boss)
        hit(lua,core,g['state'],boss,1600)
        assert half.hp==0 and len(room.enemies)==1
    a,b = [c.frame(checkpoint=True) for c in (host,guest)]
    assert all(f['kills']==1 and f['fieldBoss']['hp']==0 and 'summon' not in f['fieldBoss'] for f in (a,b))
    assert a['story']['quests'][QUEST]['count']==1 and QUEST not in b['story']['quests']
    assert all(f['checkpoint']['endgame']['bosses'][BOSS]['clears']==1 for f in (a,b))
    return {'participants':2,'sameSummonHpInBothViews':True,
            'emptyMapPreservesLiveSummon':True,'portalReturnKeepsSameSlotAndSummon':True,
            'bothViewsRemoveSummonOnBossDeath':True,'individualRewardsAndRecords':True}


if __name__=='__main__':
    evidence = {'lua':run_lua()}
    with lab() as url:
        evidence['http'] = run_http(url)
    (ROOT/'evidence/coop-tulpa-lua-http.json').write_text(
        json.dumps(evidence,indent=2)+'\n',encoding='utf-8')
    print('Shared Half-Tulpa movement, last-tick interrupt, absorption, cleanup and individual rewards passed.')
