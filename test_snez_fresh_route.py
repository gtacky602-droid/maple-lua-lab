"""Continue the fresh adventure from Snezhnaya through White Rainbow Pass."""
import argparse
from hashlib import sha256
import json
from pathlib import Path
import subprocess
import sys

from runtime import ROOT, native, runtime
from savegame import validate_save
from tools.waypoint_test import TrailWalk


def read(path):
    return json.loads(path.read_text(encoding='utf8'))


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--checkpoint', action='store_true', help='Reuse the earned Lv140 save instead of replaying from Lv1')
parser.add_argument('--draft-balance', action='store_true', help='Continue the draft field balance profile')
parser.add_argument('--after-revisits',action='store_true',help='Continue the adventure with the regional side stories')
replay = parser.add_mutually_exclusive_group()
replay.add_argument('--ticket-source', type=Path, help='Replay the first ticket and train from this Lv140 save')
replay.add_argument('--footprints-source', type=Path, help='Continue from a Lv142 station save through the two side quests')
replay.add_argument('--woods-source', type=Path, help='Replay the second White Pass chapter from a Lv145 patrol save')
options = parser.parse_args()
if options.after_revisits and options.draft_balance:
    parser.error('The revisit route uses standard balance')
draft = options.draft_balance
suffix = '-after-revisits' if options.after_revisits else '-draft' if draft else ''
work_name, earned_source = next(((name, source) for name, source in (
    ('earned-white-pass-ticket', options.ticket_source),
    ('earned-sne-mitya-footprints', options.footprints_source),
    ('earned-white-pass-woods', options.woods_source),
) if source), ('snez-fresh-route' + suffix, None))
if earned_source and (options.after_revisits or options.draft_balance or options.checkpoint):
    parser.error('Choose one standard-balance checkpoint')
if not options.checkpoint and not options.after_revisits and not earned_source:
    command = [sys.executable, str(ROOT / 'test_nod_fresh_route.py')]
    if draft:
        command.append('--draft-balance')
    subprocess.run(command, stdout=subprocess.DEVNULL, check=True)

work = ROOT / 'work' / work_name
work.mkdir(parents=True, exist_ok=True)
source_file = ROOT/'evidence/nod-revisit-save.json' if options.after_revisits else ROOT / 'work' / ('nod-fresh-route' + suffix) / 'snezhnaya-save.json'
source=(earned_source or source_file).read_bytes()
start = validate_save(json.loads(source))
original_items = {item['id'] for item in start['inventory']['items']}
hub, road, cut = 'snezhnaya-hub', 'snezhnaya-field', 'white-pass-cut'
coach, station = 'white-pass-coach', 'white-pass-station'
woods, ridge, basin = 'white-pass-woods', 'white-pass-ridge', 'white-rainbow-basin'
end = 'aurora-ice-cut'
ticket, trail_quest, summit = 'white-pass-ticket', 'white-pass-trail', 'white-pass-summit'
mitya, footprints = 'sne-mitya-observation', 'white-pass-footprints'
footwork, rest, snow = 'white-pass-footwork', 'white-pass-rest', 'sne-snow-match-quest'
if options.footprints_source:
    assert start['story']['node'] == station and start['progression']['level'] == 142
    assert start['story']['quests'][ticket]['status'] == 'complete'
elif options.woods_source:
    assert start['story']['node'] == hub and start['progression']['level'] == 145
    assert start['story']['quests'][footprints]['status'] == 'complete'
else:
    assert start['story']['node'] == hub and start['progression']['level'] == 140
assert start['story']['quests']['nod-moon-vault-quest']['status'] == 'complete'

data = read(ROOT / 'content/story-graph.json')
nodes = {n['id']: n for n in data['nodes']}
exits = {id: n['exits'] for id, n in nodes.items()}
edges = {(id, e['to']): e for id, route in exits.items() for e in route}
lua, core = runtime(draft_balance=draft)
state = core.restore(lua.table_from(start, recursive=True), 12)
trail = TrailWalk(lua, core, state, edges, exits)
advance = lua.eval('''function(C,s,n,input)
    for _=1,n do C.step(s,1/60,input) end
end''')
farm = lua.eval('''function(C,s,target,input,draft)
    local node=s.story.node
    for tick=1,4500 do
        C.step(s,1/60,input)
        if s.story.node~=node or s.progression.level>=target
                or s.actors[s.active].hp<65 or draft and s.actors[1].hp<65 or #s.inventory.ground>=12 then
            return tick
        end
    end
    return 4500
end''')
held_attack = lua.table_from({'attack': True})
milestones, hunts = [], []
recovery_trips, inventory_trips = 0, 0


def act(key):
    core.action(state, key)


def frame():
    return core.frame(state, 'sprite', 'legacy')


def cross(*stages):
    for stage in stages:
        trail.cross(stage)


def fast(stage):
    if state.story.node != stage:
        act('story_fast:' + stage)
    assert state.story.node == stage, (stage, state.storyNotice)


def near(x, y=480):
    trail.approach(x, y, 'quest objective')


def inspect(x, y=480):
    near(x, y)
    act('story_collect')


def mark(label):
    p = state.progression
    milestones.append(dict(id=label, node=state.story.node, seconds=round(state.t, 2),
                           level=p.level, total=p.total, killXp=p.killXp, questXp=p.questXp))
    print(label, p.level, p.total, flush=True)


def accept(id):
    act('story_accept:' + id)
    quest = state.story.quests[id]
    assert quest and quest.status == 'active', (id, state.storyNotice)
    return quest


def blocked(id):
    act('story_accept:' + id)
    assert state.story.quests[id] is None, (id, state.storyNotice)


def report(id):
    act('story_report:' + id)
    quest = state.story.quests[id]
    assert quest.status == 'complete' and quest.cycles == 1, (id, quest.count, state.storyNotice)
    mark(id)


def cleanup():
    items = state.inventory['items']
    spare = sorted((item for item in items.values() if item.owner == 0 and not item.locked),
                   key=lambda item: (bool(earned_source and item.id in original_items),
                                     item.rarity, item.itemLv, item.id))
    spare_needed = len(items) + len(state.inventory.ground) - 80 if earned_source else len(items) - 55
    for item in spare[:max(0, spare_needed)]:
        act('artifact_sell:' + str(item.id))
    act('artifact_recover')
    assert len(state.inventory.ground) == 0 and core.canAttack(state)


def hunt(path, gathering_x, level):
    global recovery_trips, inventory_trips
    base, *gates = path
    stage = gates[-1]
    if state.progression.level >= level:
        return
    fast(base)
    cross(*gates)
    start_kills, start_xp, start_time = state.kills, state.progression.killXp, state.t
    kills, xp, ticks = 0, 0, 0
    for _ in range(220):
        near(gathering_x)
        before_kills, before_xp = state.kills, state.progression.killXp
        act('auto')
        ticks += farm(core, state, level, trail.idle, draft)
        if state.auto:
            act('auto')
        kills += state.kills - before_kills
        xp += state.progression.killXp - before_xp
        if state.progression.level >= level:
            break
        needs_recovery = any(actor.hp < 95 for actor in state.actors.values())
        needs_inventory = len(state.inventory.ground) >= 12 or not core.canAttack(state)
        departed = state.story.node != stage
        if needs_recovery or needs_inventory or departed:
            fast(base)
            if needs_inventory:
                cleanup()
                inventory_trips += 1
            recovery_trips += int(needs_recovery or departed)
            cross(*gates)
        else:
            cross(gates[-2] if len(gates) > 1 else base, stage)
    assert state.progression.level == level, (stage, level, state.progression.level, state.storyNotice)
    assert kills > 0 and xp > 0
    hunts.append(dict(node=stage, target=level, kills=kills, xp=xp, huntSeconds=round(ticks/60, 2),
                      routeKills=state.kills-start_kills, routeXp=state.progression.killXp-start_xp,
                      routeSeconds=round(state.t-start_time, 2)))
    mark('lv' + str(level))


def fight(done, x, seconds=35):
    near(x)
    act('auto')
    for _ in range(seconds * 4):
        advance(core, state, 15, trail.idle)
        if done():
            break
    if state.auto:
        act('auto')
    assert done(), (state.story.node, state.storyNotice, trail.actor.hp)


def save(name):
    checkpoint = validate_save(native(core.checkpoint(state)))
    (work / (name + '.json')).write_text(json.dumps(checkpoint, ensure_ascii=False) + '\n', encoding='utf8')
    return checkpoint


def recruit_mitya():
    shed, yard, overlook = 'sne-survey-shed', 'sne-survey-yard', 'sne-survey-ridge'
    cross(shed)
    accept(mitya)
    inspect(311)
    cross(yard)
    inspect(349)
    inspect(942)
    cross(overlook)
    for spawn in ('sne-survey-ice-slime', 'sne-survey-hydro-slime'):
        foe = next((e for e in state.enemies.values() if e.spawnId == spawn), None)
        while foe and foe.hp > 0:
            near(foe.x - 28)
            advance(core, state, 60, held_attack)
            assert state.t < 100, (spawn, foe.x, foe.hp)
    assert state.story.quests[mitya].count == 4
    near(550, 386)
    near(900, 386)
    near(900, 291)
    inspect(1076, 291)
    inspect(1405, 386)
    near(1469, 386)
    for _ in range(2):
        act('story_survey_confirm')
        assert state.story.quests[mitya].count == 6
        act('story_collect')
    assert frame().storySurveyRig.ready
    act('story_survey_confirm')
    inspect(1592, 386)
    cross(shed)
    report(mitya)
    assert frame().storyJoined.mitya
    cross(hub)
    if not earned_source:
        cleanup()
    save('mitya-save')


cut_route = (hub, road, cut)
if options.woods_source:
    fast(station)
    blocked(trail_quest)
    assert not core.canEquipWeapon(state,'traveler','SW07')
    hunt(cut_route,260,148)
    fast(station)
    save('woods-ready')
    quest = accept(trail_quest)
    cross(woods)
    inspect(300)
    assert quest.count==1
    near(1115)
    assert not frame().storyNearbyMilestone
    inspect(1115,382)
    assert quest.count==2
    inspect(1660)
    assert quest.count==3
    cross(station)
    reward_before = state.progression.questXp, state.mora
    report(trail_quest)
    reward = [state.progression.questXp-reward_before[0], state.mora-reward_before[1]]
    attack_before = state.actors[1].atk
    act('weapon_equip:traveler:SW07')
    attack_after = state.actors[1].atk
    assert attack_after>attack_before and core.equippedWeapon(state,'traveler')=='SW07'
    blocked(summit)
    finished = save('lua-complete')
    resumed = core.restore(lua.table_from(finished,recursive=True),12)
    assert resumed.story.node==station and core.equippedWeapon(resumed,'traveler')=='SW07'
    assert resumed.actors[1].atk==attack_after
    prior = {id:q for id,q in start['story']['quests'].items() if q['status']=='complete'}
    assert all(finished['story']['quests'][id]==q for id,q in prior.items())
    kept = {item['id'] for item in finished['inventory']['items']}
    assert all(item['id'] in kept for item in start['inventory']['items'] if item['owner'] or item.get('locked'))
    assert finished['companion']==start['companion'] and state.returns==0
    cross(woods)
    inspect(1660)
    assert 'Lv155' in state.storyNotice
    record = dict(sourceSha256=sha256(source).hexdigest(), milestones=milestones, hunts=hunts,
                  reward=reward, weapon='SW07', travelerAttack=[attack_before,attack_after],
                  approach='ordinary_jump', reReadSign=True, level=finished['progression']['level'],
                  priorQuests=len(prior), inventoryKept=len(kept & original_items),
                  recoveryTrips=recovery_trips, inventoryTrips=inventory_trips, partyWipes=state.returns,
                  companion=finished['companion'])
    (work/'lua.json').write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    sys.exit(0)

if options.footprints_source:
    cross(hub)
    before_xp = state.progression.questXp
    recruit_mitya()
    mitya_reward_xp = state.progression.questXp - before_xp
    cross('sne-survey-shed')
    act('story_select_joined:' + mitya)
    assert state.companion == 'mitya' and frame().starterEquipment.flower.hp == 10
    cross(hub)
    blocked(footprints)
    hunt(cut_route, 260, 145)
    fast(hub)
    save('footprints-ready')
    route = accept(footprints)
    cross(road, cut)
    near(440)
    first = frame()
    assert any(d.color == '#59758b' for d in first.draws.values())
    assert not any(d.color == '#435872' for d in first.draws.values())
    inspect(440)
    assert route.count == 1
    near(580)
    assert not frame().storyNearbyMilestone
    assert any(d.color == '#435872' and d.y == 470 for d in frame().draws.values())
    inspect(580, 382)
    assert route.count == 2 and any(d.text == '安全な回り道' for d in frame().draws.values())
    cross(road, hub)
    before = state.progression.questXp, state.mora
    report(footprints)
    reward = [state.progression.questXp-before[0], state.mora-before[1]]
    finished = save('lua-complete')
    resumed = core.restore(lua.table_from(finished, recursive=True), 12)
    assert resumed.story.node == hub and resumed.story.quests[footprints].status == 'complete'
    prior = {id:q for id,q in start['story']['quests'].items() if q['status']=='complete'}
    assert all(finished['story']['quests'][id] == q for id,q in prior.items())
    assert state.returns == 0 and resumed.companion == 'mitya'
    kept = {item['id'] for item in finished['inventory']['items']}
    assert all(item['id'] in kept for item in start['inventory']['items'] if item['owner'] or item.get('locked'))
    record = dict(sourceSha256=sha256(source).hexdigest(), milestones=milestones, hunts=hunts,
                  mityaRewardXp=mitya_reward_xp, footprintsReward=reward, visibleTracks=True,
                  visibleCrackOnGround=True, overlookRequired=True, safePathFlag=True,
                  level=finished['progression']['level'], priorQuests=len(prior), companion=finished['companion'],
                  inventoryKept=len(kept & original_items), recoveryTrips=recovery_trips, inventoryTrips=inventory_trips,
                  partyWipes=state.returns)
    (work/'lua.json').write_text(json.dumps(record, ensure_ascii=False, indent=2)+'\n', encoding='utf8')
    sys.exit(0)

assert core.growthSkillCondition(state, 'SK58')[0] is False
blocked(ticket)
if not options.ticket_source:
    recruit_mitya()

hunt(cut_route, 260, 141)
fast(hub)
if options.ticket_source:
    save('ticket-start')
first = accept(ticket)
cross(road, cut)
inspect(282)
cart = next(e for e in state.enemies.values() if e.spawnId == 'white-pass-route-cart')
fight(lambda: first.count == 2, cart.x - 45)
inspect(685, 382)
cross(road, hub)
before_reward = (state.progression.questXp, state.mora)
report(ticket)

if options.ticket_source:
    reward = [state.progression.questXp-before_reward[0], state.mora-before_reward[1]]
    save('ticket-reported')
    cross(coach)
    assert state.voyage.kind == 'train'
    advance(core, state, 180, trail.idle)
    elapsed = frame().voyage.elapsed
    act('pause')
    advance(core, state, 180, trail.idle)
    assert frame().voyage.elapsed == elapsed
    act('pause')
    train_save = save('train-save')
    restored = core.restore(lua.table_from(train_save, recursive=True), 12)
    assert restored.story.node == hub and not restored.voyage and restored.story.quests[ticket].status == 'complete'
    advance(core, state, 360, trail.idle)
    assert state.story.node == station and state.voyage is None
    arrived = save('lua-arrived')
    assert core.restore(lua.table_from(arrived, recursive=True), 12).story.node == station
    prior = {id:q for id,q in start['story']['quests'].items() if q['status']=='complete'}
    assert all(arrived['story']['quests'][id] == q for id,q in prior.items())
    assert arrived['companion'] == start['companion'] and state.returns == 0
    kept = {item['id'] for item in arrived['inventory']['items']}
    assert all(item['id'] in kept for item in start['inventory']['items'] if item['owner'] or item.get('locked'))
    result = dict(sourceSha256=sha256(source).hexdigest(), milestones=milestones, hunts=hunts,
                  reward=reward, trainSeconds=9, pausedTrain=True, midRideResume=hub, destination=station,
                  level=arrived['progression']['level'], priorQuests=len(prior), companion=arrived['companion'],
                  inventoryKept=len(kept & original_items), originalInventory=len(original_items),
                  recoveryTrips=recovery_trips, inventoryTrips=inventory_trips, partyWipes=state.returns)
    (work/'lua.json').write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n', encoding='utf8')
    sys.exit(0)

hunt(cut_route, 260, 145)
fast(hub)
accept(footprints)
cross(road, cut)
inspect(440)
inspect(580, 382)
cross(road, hub)
report(footprints)

cross(coach)
assert state.voyage.kind == 'train'
boarding = state.t
train_save = save('train-save')
assert core.restore(lua.table_from(train_save, recursive=True), 12).story.node == hub
advance(core, state, 540, trail.idle)
assert state.story.node == station and state.voyage is None
ride_seconds = round(state.t - boarding, 2)
mark('train-arrived')
blocked(trail_quest)

hunt(cut_route, 260, 148)
fast(station)
accept(trail_quest)
cross(woods)
inspect(300)
inspect(1115, 382)
inspect(1660)
cross(station)
report(trail_quest)
if draft:
    before = state.actors[1].atk
    act('weapon_equip:traveler:SW07')
    assert core.equippedWeapon(state, 'traveler') == 'SW07'
    sword_reward = dict(weapon='SW07', quest=trail_quest, before=before, after=state.actors[1].atk)

accept(snow)
inspect(327)
arena = 'sne-snow-match'
cross(arena)
inspect(178)
act('story_collect')
assert frame().storySnowball.running
for _ in range(40):
    if not state.snowballRound:
        break
    advance(core, state, 60, held_attack)
assert state.story.quests[snow].count == 3 and not state.snowballRound
snow_record = native(state.story.quests[snow].snowMatchRecord)
cross(station)
report(snow)

woods_route = (station, woods)
hunt(woods_route, 260, 149)
fast(station)
accept(footwork)
inspect(450, 390)
inspect(670)
report(footwork)
hunt(woods_route, 260, 153)
fast(station)
accept(rest)
inspect(895)
cross(woods)
inspect(185)
cross(station)
report(rest)

hunt(woods_route, 260, 155)
ridge_route = (station, woods, ridge)
hunt(ridge_route, 260, 156)
fast(station)
accept(summit)
cross(woods, ridge, basin)
slot = state.fieldSlots['original-frost-antler']
fight(lambda: slot.phase == 'respawn', 641, 180)
inspect(1380)
cross(ridge, woods, station)
report(summit)
if state.progression.level < 160:
    near(861)
    portal = frame().storyNearbyPortal
    assert portal.to == end and not portal.available and portal.level == 160
    hunt(ridge_route, 260, 160)
fast(station)
save('aurora-ready-save')
cross(end)
mark(end)
assert len(state.enemies) > 0
cross(station)
mark(station)
finished = save('white-pass-save')
restored = core.restore(lua.table_from(finished, recursive=True), 12)
done = [mitya, ticket, footprints, trail_quest, snow, footwork, rest, summit]
assert restored.story.node == station and restored.progression.level == 160
assert restored.progression.total == state.progression.total
assert all(restored.story.quests[id].status == 'complete' and restored.story.quests[id].cycles == 1 for id in done)
assert restored.endgame.bosses['original-frost-antler'].clears == 1
if draft:
    assert core.equippedWeapon(restored, 'traveler') == 'SW07'
assert state.returns == 0

check = TrailWalk(lua, core, restored, edges, exits)
check.cross(end)
if restored.active != 1:
    core.action(restored, 'swap')
assert restored.story.quests['growth-light-release'] is None
assert core.growthSkillCondition(restored, 'SK58') is True
assert core.growthSkillCondition(restored, 'SK59')[0] is False
gauge = restored.gauge
core.action(restored, 'light')
assert restored.actors[1].light == 12 and restored.gauge == gauge - 60

result = dict(sourceSha256=sha256(source).hexdigest(), route=milestones, hunts=hunts, completedQuests=done, trainSeconds=ride_seconds,
              snowMatch=snow_record, recoveryTrips=recovery_trips, inventoryTrips=inventory_trips,
              partyWipes=state.returns, savedAndRestored=True, unlockedHunt=end, lightReleaseAt160=True,
              scope='Earned Lv140 checkpoint from a new Lv1 adventure. Lua movement and built-in auto battle.')
if draft:
    result.update(weaponReward=sword_reward, draftBalance=True)
if options.after_revisits:
    for id,record in start['story']['quests'].items():
        if record['status']=='complete':
            assert finished['story']['quests'][id]==record
    result['sourceSha256']=sha256(source.replace(b'\r\n',b'\n')).hexdigest()
    (ROOT/'evidence/snez-revisit-save.json').write_bytes((json.dumps(finished,ensure_ascii=False,sort_keys=True)+'\n').encode('utf8'))
(ROOT / 'evidence' / f'snez-fresh-route{suffix}.json').write_text(
    json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
