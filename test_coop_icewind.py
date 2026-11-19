"""Run both Icewind performances through the same cooperative room."""
import json
from math import floor

from experience import LEVELS, RUNTIME_EXP
from runtime import ROOT, native, runtime
from test_coop_anemo import TICK, place, wait_cast
from test_coop_local import Client, LOCK, SESSIONS, lab
from test_coop_travel import cross


HUB, ENTRY = 'fontaine-hub', 'icewind-promenade'
COPPELIA, COPPELIUS = 'icewind-coppelia', 'icewind-coppelius'
ENTITY, HP, MORA = 24070301, 1030, 325
LEVEL = LEVELS[89]
XP = LEVEL['normal_enemy_base_exp'] * RUNTIME_EXP['roles']['field_boss']


def accept(core, state, variant):
    core.action(state, 'story_accept:' + variant + '-commission')
    assert state.story.quests[variant + '-commission'].status == 'active'


def prepare(core, variant, accepted):
    state = core.new(12)
    core.action(state, 'story_start')
    core.grantExp(state, LEVEL['maple_reference_total_exp_to_reach'], 'quest')
    core.enterStoryNode(state, HUB)
    if accepted:
        accept(core, state, variant)
    core.enterStoryNode(state, variant + '-field')
    place(state, state.fieldSlots[variant].enemy.x - 85)
    return state


def attack(lua, body, x=None, power=20, radius=250):
    return lua.table(id=1, atk=power, x=body.x if x is None else x, y=480, dir=1,
                     radial=True, range=radius, limit=5, mult=1, color='#fff0ac',
                     gain=0, element='physical', critRate=0, targetId=body.id)


def damage(core, state, body, cast):
    before = body.hp
    core.resolveCast(state, cast)
    return before-body.hp


def run_lua():
    lua, core = runtime()
    parties = [prepare(core, COPPELIUS, accepted) for accepted in (True, False, True, True)]
    room = core.newCoop(parties[0])
    for state in parties:
        core.attachCoop(room, state)
    slot = room.fieldSlot
    lead, partner = slot.enemy, slot.enemy.fieldPartner
    step = lambda: core.stepCoop(room, TICK)
    assert lead.hp == partner.hp == HP and lead.id == -partner.id == ENTITY
    solo = prepare(core, COPPELIUS, False)
    assert solo.fieldSlots[COPPELIUS].enemy.hp == HP
    assert (lead.element,partner.element)==('cryo','anemo')
    wide = attack(lua, lead, x=(lead.x+partner.x)/2)
    wide.targetId = None
    amount = damage(core, parties[0], lead, wide)
    assert amount > 0 and parties[0].hits==1 and lead.hp==partner.hp==HP-amount
    assert damage(core, parties[1], partner, attack(lua, partner))==amount
    assert lead.hp==partner.hp==HP-2*amount

    wait_cast(step, slot, 'FIP02', 106)
    duet = slot.cast
    for i, state in enumerate(parties):
        place(state, duet.ends[1 if i<2 else 2])
    starts = [state.seq for state in parties]
    wait_cast(step, slot, 'FIP02', 170)
    impacts = [[(e.target,e.element,e.value) for e in state.events.values()
                if e.seq>seq and e.kind=='hurt'] for state,seq in zip(parties,starts)]
    assert impacts == [[(ENTITY,'cryo',19)]]*2 + [[(-ENTITY,'anemo',19)]]*2

    wait_cast(step, slot, 'FIP03', 54)
    guard = slot.cast
    assert lead.form=='guarded' and guard.guardHits==0
    assert damage(core, parties[1], partner, attack(lua, partner))==amount
    assert guard.guardHits==0
    saved_attack = attack(lua, lead)
    for _ in range(2):
        assert damage(core, parties[0], lead, saved_attack)==floor(amount*.6)
    assert guard.guardHits==1
    assert damage(core, parties[1], lead, attack(lua, lead))==floor(amount*.6)
    assert all(core.frame(s).fieldBoss.label.endswith('2/3') for s in parties)
    assert damage(core, parties[2], lead, attack(lua, lead))==floor(amount*.6)
    assert lead.form=='guard-broken' and guard.guardHits==3
    assert all(core.frame(s).fieldBoss.label=='氷装甲がほどける' for s in parties)
    assert damage(core, parties[0], lead, attack(lua, lead))==amount
    assert all(s.kills==s.mora==s.progression.killXp==0 for s in parties)

    # A player can fight from the other body's side with a ranged attack.
    far = partner.x + (275 if partner.x>lead.x else -275)
    assert abs(far-lead.x)>420 and abs(far-partner.x)<420
    place(parties[1], far)
    for state in (parties[0],parties[2]):
        place(state, lead.x-75)
    damage(core,parties[1],partner,attack(lua,partner,x=far,radius=350))
    damage(core,parties[1],partner,attack(lua,partner,x=far,power=1600,radius=350))
    assert lead.hp==partner.hp==0 and slot.phase=='respawn'
    assert [s.kills for s in parties]==[1,1,1,0]
    assert [s.mora for s in parties]==[MORA]*3+[0]
    assert [s.progression.killXp for s in parties]==[XP]*3+[0]
    assert all(s.endgame.bosses[COPPELIUS].clears==1 for s in parties[:3])
    assert [parties[i].story.quests[COPPELIUS+'-commission'].count for i in (0,2,3)]==[1,1,0]
    for _ in range(3599):
        step()
    assert slot.phase=='respawn'
    step()
    assert slot.generation==2 and slot.enemy.hp==slot.enemy.fieldPartner.hp==HP
    assert [s.kills for s in parties]==[1,1,1,0]

    # A room started mid-duet retains the host's hit and can still hit the guest.
    solo_slot = solo.fieldSlots[COPPELIUS]
    solo_step = lambda: core.step(solo,TICK)
    wait_cast(solo_step,solo_slot,'FIP02',106)
    place(solo,solo_slot.cast.ends[1])
    before = solo.actors[1].hp
    wait_cast(solo_step,solo_slot,'FIP02',113)
    assert solo.actors[1].hp==before-19 and solo_slot.cast.seen[1][1]
    solo.actors[1].inv = 0
    joined = core.newCoop(solo)
    core.attachCoop(joined,solo)
    guest = prepare(core,COPPELIUS,False)
    place(guest,joined.fieldSlot.cast.ends[1])
    core.attachCoop(joined,guest)
    core.stepCoop(joined,TICK)
    assert solo.actors[1].hp==before-19 and guest.actors[1].hp==guest.actors[1].maxhp-19
    return {'soloAndFourPlayerHp':HP, 'bothBodiesShareHp':True, 'twoTargetsOneHitPerCast':True,
            'duetDamageByBody':{'cryo':19,'anemo':19}, 'guardHitsFromThreeParties':3,
            'repeatCastNotCountedTwice':True, 'guardedHit':floor(amount*.6), 'unguardedHit':amount,
            'midDuetPreservedPreviousHitButHitNewGuest':True,
            'partnerSideOutsideLeadRewardRangeReceivesOneReward':True, 'killXp':XP, 'killMora':MORA,
            'respawnTicks':3600}


def run_http(url):
    clients = [Client(url) for _ in range(4)]
    assignments = [COPPELIA,COPPELIA,COPPELIUS,COPPELIUS]
    for i, client in enumerate(clients):
        client.frame(['story_start'])
        with LOCK:
            env = SESSIONS[client.sid]
            env['core'].grantExp(env['state'], LEVEL['maple_reference_total_exp_to_reach'], 'quest')
            env['core'].enterStoryNode(env['state'], HUB)
            env['state'].actors[2].hp = 0
        if i in (0,2):
            q = assignments[i] + '-commission'
            assert client.frame(['story_accept:'+q])['story']['quests'][q]['status']=='active'
        cross(client,580,ENTRY)
    code = clients[0].frame(['coop_create'])['coop']['code']
    for client in clients[1:]:
        assert client.frame(['coop_join:'+code])['coop']['code']==code
    for client, variant in zip(clients,assignments):
        joined = cross(client,420 if variant==COPPELIA else 1060,variant+'-field')
        assert joined['coop']['code']==code and len(joined['coop']['enemies'])==2
    for client in clients:
        client.frame()
    with LOCK:
        envs = [SESSIONS[c.sid] for c in clients]
        for index, env in enumerate(envs[:2]):
            field = env['coop_room'].worlds[COPPELIA+'-field']
            lead = field.fieldSlot.enemy
            body = lead if index==0 else lead.fieldPartner
            place(env['state'],body.x-65)
            damage(env['core'],env['state'],body,attack(env['lua'],body,power=20 if index==0 else 1600))
    frames = [c.frame(checkpoint=True) for c in clients]
    assert [f['kills'] for f in frames]==[1,1,0,0]
    assert [[e['hp'] for e in f['coop']['enemies']] for f in frames]==[[0,0],[0,0],[HP,HP],[HP,HP]]
    assert frames[0]['story']['quests'][COPPELIA+'-commission']['count']==1
    assert frames[2]['story']['quests'][COPPELIUS+'-commission']['count']==0
    assert all(f['checkpoint']['endgame']['bosses'][COPPELIA]['clears']==1 for f in frames[:2])
    with LOCK:
        for index, env in enumerate(envs[2:]):
            field = env['coop_room'].worlds[COPPELIUS+'-field']
            lead = field.fieldSlot.enemy
            body = lead.fieldPartner if index==0 else lead
            place(env['state'],body.x-65)
            damage(env['core'],env['state'],body,attack(env['lua'],body,power=20 if index==0 else 1600))
    frames = [c.frame(checkpoint=True) for c in clients]
    assert [f['kills'] for f in frames]==[1,1,1,1]
    assert frames[2]['story']['quests'][COPPELIUS+'-commission']['count']==1
    assert COPPELIUS+'-commission' not in frames[3]['story']['quests']
    assert all(list(f['checkpoint']['endgame']['bosses'])==[variant] for f,variant in zip(frames,assignments))
    return {'participants':4, 'sameRoomSeparatePerformances':True,
            'eachPairHasSharedHpAndOneKillRecord':True, 'partnerFinalHitRegistersOnce':True,
            'performancesHaveSeparateQuestProgress':True}


if __name__ == '__main__':
    evidence = {'lua':run_lua()}
    with lab() as url:
        evidence['http'] = run_http(url)
    (ROOT/'evidence/coop-icewind-lua-http.json').write_text(
        json.dumps(evidence,indent=2)+'\n',encoding='utf-8')
    print('Icewind shared health, separate hitboxes, combined ice armor and split-map rewards passed.')
