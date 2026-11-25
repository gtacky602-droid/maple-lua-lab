"""Play the late game using the equipment and records earned from the Lv1 route."""
import argparse
from hashlib import sha256
import json
import subprocess
import sys

from experience import LEVELS
from runtime import ROOT, native, runtime
from savegame import validate_save
from tools.waypoint_test import TrailWalk


def read(path):
    return json.loads((ROOT / path).read_text(encoding='utf8'))


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--replay', action='store_true', help='Regenerate the upstream Lv160 checkpoint')
parser.add_argument('--draft-balance', action='store_true', help='Continue the draft field balance profile')
parser.add_argument('--checkpoint-165', action='store_true', help='Stop after earning the Lv165 checkpoint')
parser.add_argument('--after-revisits',action='store_true',help='Continue the adventure with the regional side stories')
options = parser.parse_args()
if options.after_revisits and options.draft_balance:
    parser.error('The revisit route uses standard balance')
draft = options.draft_balance
suffix = '-after-revisits' if options.after_revisits else '-draft' if draft else ''
if options.replay:
    command = [sys.executable, str(ROOT / 'test_snez_fresh_route.py')]
    if draft:
        command.append('--draft-balance')
    if options.after_revisits:
        command.append('--after-revisits')
    subprocess.run(command, stdout=subprocess.DEVNULL, check=True)

work = ROOT / 'work' / ('cap-fresh-route' + suffix)
work.mkdir(parents=True, exist_ok=True)
source_file = ROOT/'evidence/snez-revisit-save.json' if options.after_revisits else ROOT / 'work' / ('snez-fresh-route' + suffix) / 'white-pass-save.json'
source=source_file.read_bytes()
initial = validate_save(json.loads(source))
station, snow, town = 'white-pass-station', 'snezhnaya-hub', 'mond-town'
assert initial['story']['node'] == station and initial['progression']['level'] == 160
assert initial['story']['quests']['white-pass-summit']['status'] == 'complete'
chain = [
    station, 'aurora-ice-cut', 'aurora-ice-shelf', 'aurora-steam-channel', 'aurora-mineral-terraces',
    'dawn-vein-mine', 'dawn-vein-deep', 'dawn-glass-ridge', 'dawn-glass-divide', 'dawn-crystal-field',
]
release, branch, echo, seven, personal = ('growth-' + key for key in
    ('light-release', 'branch-visit', 'light-echo', 'seven-strike', 'next-goal'))
exits = {n['id']: n['exits'] for n in read('content/story-graph.json')['nodes']}
edges = {(id, e['to']): e for id, gates in exits.items() for e in gates}
lua, core = runtime(draft_balance=draft)
idle = lua.table()
advance = lua.eval('''function(C,s,n,input)
    for _=1,n do C.step(s,1/60,input) end
end''')
farm = lua.eval('''function(C,s,target,n,input,draft)
    local start=s.story.node
    for i=1,n do
        C.step(s,1/60,input)
        if s.progression.level>=target or s.story.node~=start
            or s.actors[s.active].hp<80 or draft and s.actors[1].hp<80
            or #s.inventory.ground>=15 then return i end
    end
    return n
end''')
progression = dict(hunts=[], milestones=[], equipment=[], rests=0, inventoryStops=0)
state = core.restore(lua.table_from(initial, recursive=True), 12)
trail = TrailWalk(lua, core, state, edges, exits)
attack = lua.table_from({'attack': True})


def act(command):
    core.action(state, command)


def tick(n, controls=idle):
    advance(core, state, n, controls)


def near(x, y=480):
    trail.approach(x, y, 'late-game route')


def cross(*nodes):
    for node in nodes:
        trail.cross(node)


def fast(node):
    if state.story.node != node:
        act('story_fast:' + node)
    assert state.story.node == node, (node, state.storyNotice)


def select_actor(owner):
    if state.active != owner:
        tick(26)
        act('swap')
        tick(26)
    assert state.active == owner


def traveler():
    select_actor(1)


def toggle_auto(value):
    if bool(state.auto) != value:
        act('auto')


def frame():
    return core.frame(state, 'sprite', 'legacy')


def save(name):
    data = validate_save(native(core.checkpoint(state)))
    (work / (name + '.json')).write_text(json.dumps(data, ensure_ascii=False) + '\n', encoding='utf8')
    return data


def write_progress(label):
    p = state.progression
    row = dict(id=label, node=state.story.node, level=p.level, exp=p.total, kills=state.kills,
               seconds=round(state.t, 2))
    progression['milestones'].append(row)
    print(row, flush=True)


def route_checkpoint():
    assert state.story.node == station
    save('route-save')
    (work / 'route-progress.json').write_text(json.dumps(progression, ensure_ascii=False), encoding='utf8')


def accept(id):
    act('story_accept:' + id)
    assert state.story.quests[id] is not None, (id, state.storyNotice)


def report(id):
    act('story_report:' + id)
    q = state.story.quests[id]
    assert q and q.status == 'complete' and q.cycles == 1, (id, q and q.count, state.storyNotice)
    before = state.progression.questXp
    act('story_report:' + id)
    assert state.progression.questXp == before


def renew_equipment():
    items = list(state.inventory['items'].values())
    for slot in (1, 2):
        for owner in (1, 2):
            def equipped(item):
                return item.owner == owner and (owner == 1 or item.companionId == state.companion)
            current = next(item for item in items if item.slot == slot and equipped(item))
            candidates = [item for item in items if item.slot == slot and item.owner == 0
                          and item.setId == current.setId and not item.locked]
            best = max(candidates, key=core.artifactStats, default=current)
            before, after = core.artifactStats(current), core.artifactStats(best)
            if after <= before:
                continue
            select_actor(owner)
            act('artifact_equip:' + str(best.id))
            assert equipped(best)
            progression['equipment'].append(dict(level=state.progression.level, slot=slot, actor=owner,
                                                oldMain=before, newMain=after, itemLv=best.itemLv, item=best.id))
    traveler()


def resupply():
    toggle_auto(False)
    fast(station)
    renew_equipment()
    items = list(state.inventory['items'].values())
    spare = sorted((item for item in items if item.owner == 0 and not item.locked),
                   key=lambda item: (item.rarity, item.itemLv, item.id))
    for item in spare[:max(0, len(items) - 55)]:
        act('artifact_sell:' + str(item.id))
    act('artifact_recover')
    assert not len(state.inventory.ground) and core.canAttack(state)
    renew_equipment()


def enter(index):
    fast(station)
    cross(*chain[1:index+1])


def assert_locked(destination, level):
    edge = edges[state.story.node, destination]
    near(edge['x'], edge.get('y', 480))
    portal = frame().storyNearbyPortal
    assert portal.to == destination and not portal.available and portal.level == level


def hunt(index, level):
    stage = chain[index]
    enter(index)
    assert_locked(chain[index+1], level)
    start_xp, start_kills, start_time = state.progression.killXp, state.kills, state.t
    work_ticks = 0
    for attempt in range(320):
        if state.progression.level >= level:
            break
        near(265)
        before = state.kills
        toggle_auto(True)
        work_ticks += farm(core, state, level, 5400, idle, draft)
        toggle_auto(False)
        if state.progression.level >= level:
            break
        hp_stop = state.story.node != stage or any(a.hp < 120 for a in state.actors.values())
        item_stop = len(state.inventory.ground) >= 15 or not core.canAttack(state)
        if hp_stop or item_stop:
            progression['rests'] += int(hp_stop)
            progression['inventoryStops'] += int(item_stop)
            resupply()
            cross(*chain[1:index+1])
        elif state.kills == before:
            cross(chain[index-1],stage)
        if attempt % 80 == 79:
            print(stage, 'progress', state.progression.level, state.kills-start_kills, flush=True)
    assert state.progression.level == level, (stage, state.progression.level, level)
    progression['hunts'].append(dict(node=stage, toLevel=level, kills=state.kills-start_kills,
                                    exp=state.progression.killXp-start_xp, autoSeconds=round(work_ticks/60,2),
                                    seconds=round(state.t-start_time,2)))
    cross(chain[index+1])
    write_progress('lv'+str(level))
    fast(station)


def configure(*skills):
    slots = [[skill] for skill in skills] + [[] for _ in range(8-len(skills))]
    assert core.configure(state, lua.table_from(slots, recursive=True))[0]


def charge():
    traveler()
    if state.gauge >= 100:
        return
    toggle_auto(True)
    for _ in range(120):
        tick(10)
        if state.gauge >= 100:
            break
    toggle_auto(False)
    assert state.gauge >= 100, (state.story.node, state.gauge)


def battle_site():
    near(300)
    traveler()
    charge()
    tick(48)


def use_light():
    act('light')
    assert state.actors[1].light > 11 and state.gauge < 60
    tick(23)


def learn_release():
    fast(town)
    accept(release)
    accept(branch)
    enter(1)
    charge()
    use_light()
    for _ in range(4):
        foe = next(e for e in state.enemies.values() if e.hp > 0 and e.y >= 475)
        near(max(20, foe.x - 50))
        tick(2, trail.inputs['right'])
        tick(21, attack)
        if state.story.growth['light-normal']:
            break
    assert state.story.growth['light-normal'], (trail.actor.x, state.gauge)
    fast(town)
    report(release)
    cross('mond-road', 'mond-border', 'dragonspine-camp', 'dragonspine-depth')
    near(540)
    assert frame().growthBranchObserve or state.story.quests[branch].count == 1
    if state.story.quests[branch].count == 0:
        act('story_collect')
    fast(town)
    report(branch)
    fast(station)
    write_progress('release-and-exploration')


def learn_echo():
    assert state.story.quests[echo] is None and core.growthSkillCondition(state, 'SK59') is True
    configure('SK09', 'SK59')
    enter(3)
    battle_site()
    tick(2, trail.inputs['right'])
    use_light()
    act('slot1')
    tick(42)
    assert state.echoSource is not None and state.echoSource.cast.key == 'SK09'
    near(980)
    tick(2, trail.inputs['right'])
    act('slot2')
    tick(45)
    assert state.story.growth['light-echo'], (trail.actor.x, state.skillNotice)
    fast(snow)
    accept(echo)
    report(echo)
    fast(station)
    configure('SK01', 'SK02')
    write_progress('live-light-echo')


def learn_seven():
    assert state.story.quests[seven] is None and core.growthSkillCondition(state, 'SK60') is True
    configure('SK01', 'SK02', 'SK60')
    enter(5)
    battle_site()
    before = state.damage
    act('slot3')
    tick(1)
    assert state.gauge < 6 and state.ultimate
    tick(179)
    assert state.damage > before and not state.ultimate and state.story.growth['seven-strike']
    fast(snow)
    accept(seven)
    report(seven)
    fast(station)
    configure('SK01', 'SK02')
    write_progress('live-seven-strike')


def gear_goal():
    fast(town)
    accept(personal)
    act('endgame_goal:gear')
    assert state.story.quests[personal].count == 1
    renew_equipment()
    if state.story.quests[personal].count == 2:
        report(personal)
    fast(station)


assert core.growthSkillCondition(state, 'SK59')[0] is False
assert core.growthSkillCondition(state, 'SK60')[0] is False
resupply()
learn_release()
if not options.checkpoint_165:
    route_checkpoint()

for index, level in enumerate(range(165, 201, 5), start=1):
    if state.progression.level < level:
        hunt(index, level)
        if level == 165:
            save('lv165-save')
            if options.checkpoint_165:
                sys.exit(0)
        elif level == 170:
            assert core.growthSkillCondition(state,'SK60')[0] is False
            learn_echo()
        elif level == 180:
            learn_seven()
            gear_goal()
            save('lv180-save')
        if level > 180 and state.story.quests[personal].status != 'complete':
            fast(town)
            renew_equipment()
            if state.story.quests[personal].count == 2:
                report(personal)
            fast(station)
        route_checkpoint()

assert state.progression.level == 200 and state.progression.xp == 0
assert state.progression.total >= LEVELS[199]['maple_reference_total_exp_to_reach']
enter(9)
near(265)
p = state.progression
before = dict(total=p.total, base=p.baseXp, overflow=p.overflowXp, kills=state.kills)
toggle_auto(True)
ticks = farm(core, state, 201, 3600, idle, draft)
toggle_auto(False)
delta = p.total-before['total']
assert p.level == 200 and p.xp == 0 and delta > 0
assert p.baseXp-before['base']==p.overflowXp-before['overflow']==delta
cap_field_save = save('cap-field-save')
fast(station)
cap = save('lv200-save')
restored = core.restore(lua.table_from(cap, recursive=True), 12)
roundtrip = validate_save(native(core.checkpoint(restored)))
assert roundtrip['progression'] == cap['progression'] and roundtrip['inventory'] == cap['inventory']
assert roundtrip['story']['quests'] == cap['story']['quests']
if draft:
    assert roundtrip['weapons'] == cap['weapons']
assert cap_field_save['progression'] == cap['progression']
expected = [release, branch, echo, seven, personal]
assert all(roundtrip['story']['quests'][id]['status']=='complete' for id in expected), expected
progression.update(
    method='Earned Lv160 checkpoint from Lv1. Normal travel, optional growth quests, field skills, and auto battle.',
    startingLevel=160, endLevel=p.level, totalExp=p.total, kills=state.kills-initial['kills'],
    partyWipes=state.returns, growthQuests=expected,
    cap=dict(node=chain[-1], kills=state.kills-before['kills'], extraExp=delta, seconds=round(ticks/60,2),
             overflow=p.overflowXp, restored=True),
)
write_progress('lv200-post-cap')
if draft:
    progression.update(sourceSha256=sha256(source).hexdigest(), draftBalance=True)
if options.after_revisits:
    for id,record in initial['story']['quests'].items():
        if record['status']=='complete':
            assert cap['story']['quests'][id]==record
    progression['sourceSha256']=sha256(source.replace(b'\r\n',b'\n')).hexdigest()
    (ROOT/'evidence/cap-revisit-save.json').write_bytes((json.dumps(cap,ensure_ascii=False,sort_keys=True)+'\n').encode('utf8'))
(ROOT / 'evidence' / f'cap-fresh-route{suffix}.json').write_text(
    json.dumps(progression,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
