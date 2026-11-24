"""Drive lunar reactions and a star seed through the shared combat world."""

import json

from experience import LEVELS
from runtime import ROOT, native, runtime
from savegame import validate_save


lua, core = runtime()


def party(partner):
    state = core.new(12)
    core.action(state, 'story_start')
    core.grantExp(state, LEVELS[148]['maple_reference_total_exp_to_reach'], 'quest')
    for node in ('inazuma-town', 'nod-port', 'snezhnaya-hub', 'mond-town'):
        core.enterStoryNode(state, node)
    core.action(state, 'companion:' + partner)
    slots = [['SK09'], ['SK56'], ['SK54']] + [[] for _ in range(5)]
    assert core.configure(state, lua.table_from(slots, recursive=True))[0]
    return state


def encounter(partner='columbina', hp=5000, *, solo_water=False):
    host, guest = party('columbina'), party(partner)
    host.t = 40
    for state in (host, guest):
        core.enterStoryNode(state, 'mond-road')
        for actor in state.actors.values():
            actor.x, actor.dir, actor.inv = 200, 1, 999
        state.actors[2].lock = 999
    target = lua.table(id=91, x=260, home=260, y=480, hp=hp, maxhp=hp,
                       cd=999, root=999, warning=0, kind=1, custom=True, spawnId='test-target')
    host.enemies = lua.table_from([target])
    if solo_water:
        hit(host, target, 'hydro', 'pre-room-water', actor=2)
    room = core.newCoop(host)
    core.attachCoop(room, host)
    core.attachCoop(room, guest)
    return room, host, guest, target


def hit(state, target, element, key, *, actor=1, atk=10):
    cast = lua.table(id=actor, key=key, element=element, atk=atk, range=50,
                     limit=1, targetId=target.id, dir=1, x=target.x, y=target.y,
                     mult=1, color='#eeeeff', gain=0, critRate=0)
    core.resolveCast(state, cast)


def ticks(room, count):
    for _ in range(count):
        core.stepCoop(room, 1/60)


def moon_events(state):
    return [row for row in (state.reactions or {}).values() if row.kind == 'moon-electro']


room, host, guest, target = encounter()
hit(host, target, 'hydro', 'host-water', actor=2)
hit(guest, target, 'electro', 'guest-electric')
assert guest.lastMoonReaction is None, 'Foreign Columbina aura triggered the guest lunar reaction'
assert target.aura.ownerSlot == guest.coopMember.id

room, host, guest, target = encounter()
hit(host, target, 'electro', 'host-electric')
hit(guest, target, 'hydro', 'guest-water', actor=2)
assert guest.lastMoonReaction is None, 'Foreign Traveler aura triggered the guest lunar reaction'
assert target.aura.ownerSlot == guest.coopMember.id

room, host, guest, target = encounter()
hit(guest, target, 'hydro', 'expired-water', actor=2)
target.aura.expires = room.time - .01
hit(guest, target, 'electro', 'after-expiry')
assert guest.lastMoonReaction is None, 'An old aura passed the guest clock check'

room, host, guest, target = encounter(hp=29)
hit(host, target, 'physical', 'host-contribution')
hit(guest, target, 'hydro', 'own-water', actor=2)
hit(guest, target, 'electro', 'own-electric')
result, = moon_events(guest)
assert result.ownerSlot == guest.coopMember.id and result.auraOwnerSlot == guest.coopMember.id
assert result.owner == 1 and result.auraOwner == 2 and result.target == target.id
assert guest.gauge == host.gauge == 60
assert target.hp == 0 and host.kills == guest.kills == 1
assert host.mora == guest.mora == 10 and not moon_events(host)
ticks(room, 120)
assert host.kills == guest.kills == 1

room, host, guest, target = encounter(solo_water=True)
assert target.aura.ownerSlot == host.coopMember.id
assert target.applicationClocks[f'{host.coopMember.id}:2:pre-room-water'] == room.time + 2.5
hit(host, target, 'electro', 'first-in-room')
assert len(moon_events(host)) == 1
assert not moon_events(guest)

room, host, guest, target = encounter()
hit(guest, target, 'geo', 'crystallizing-geo')
hit(guest, target, 'hydro', 'water-after-geo', actor=2)
assert guest.lastMoonReaction.name == '月結晶'
assert guest.reactions[1].owner == 2 and guest.reactions[1].auraOwner == 1

room, host, guest, target = encounter()
hit(host, target, 'pyro', 'host-ignition')
hit(guest, target, 'dendro', 'guest-burning')
burn = guest.reactions[1]
assert burn.kind == 'burning'
assert burn.ownerSlot == guest.coopMember.id and burn.auraOwnerSlot == host.coopMember.id
host_damage, guest_damage = host.damage, guest.damage
ticks(room, 60)
assert host.damage == host_damage and guest.damage > guest_damage

room, host, guest, target = encounter()
hit(guest, target, 'hydro', 'first-water', actor=2)
hit(guest, target, 'electro', 'multi-hit-electric')
ticks(room, 30)
hit(guest, target, 'hydro', 'water-before-icd', actor=2)
hit(guest, target, 'electro', 'different-electric')
assert len(moon_events(guest)) == 1, 'The party lunar interval was ignored'
ticks(room, 45)
hit(host, target, 'cryo', 'replace-electric-aura')
hit(guest, target, 'hydro', 'water-after-icd', actor=2)
hit(guest, target, 'electro', 'multi-hit-electric')
assert len(moon_events(guest)) == 1, 'A hit without fresh elemental application triggered a reaction'
ticks(room, 80)
hit(guest, target, 'electro', 'multi-hit-electric')
assert len(moon_events(guest)) == 2

room, host, guest, target = encounter('wanderer')
core.action(guest, 'slot2')
ticks(room, 1)
assert guest.starSeed is not None and host.starSeed is None
assert any(draw.color == '#a5e8dc' for draw in core.frame(host).draws.values())
hit(host, target, 'physical', 'other-party-hit')
assert guest.starSeed.growth == 0
hit(guest, target, 'physical', 'star-owner-hit')
hit(guest, target, 'physical', 'same-tick-owner-hit')
assert guest.starSeed.growth == 1
host_damage = host.damage
ticks(room, 731)
assert guest.starSeed is None
assert guest.hits == 15 and host.hits == 1 and host.damage == host_damage
ticks(room, 60)
assert guest.hits == 15

for partner in ('columbina', 'wanderer'):
    sample = party(partner)
    core.enterStoryNode(sample, 'nod-port')
    path = ROOT / f'work/coop-element-{partner}.json'
    path.parent.mkdir(exist_ok=True)
    data = validate_save(native(core.checkpoint(sample)))
    path.write_text(json.dumps(data, ensure_ascii=False), encoding='utf8')

proof = {
    'browserFixtureLevel': 149,
    'clockSkewSeconds': 40,
    'foreignAuraRejectedInBothOrders': True,
    'expiredAuraRejectedWithClockSkew': True,
    'ownerSlotsAndSeparateKillRewards': True,
    'preRoomAuraAndApplicationTimerAdopted': True,
    'reverseLunarCrystallize': True,
    'ordinaryBurningAllowsCrossPartyAura': True,
    'partyReactionCooldownAndApplicationCooldown': True,
    'starOwnerGrowthOnceAndFinalHitOnce': True,
    'starSeedDrawnForPeer': True,
}
(ROOT/'evidence/coop-lunar-star-lua.json').write_text(json.dumps(proof, indent=2)+'\n', encoding='utf8')
print('Shared lunar reactions and star seeds preserve party attribution, cooldowns, and rewards.')
