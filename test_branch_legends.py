"""Walk, fight, leave and retry optional legend encounters on the normal Lua entry path."""
import json

from experience import LEVELS, RUNTIME_EXP
from runtime import ROOT, native, runtime
from savegame import validate_save
from tools.waypoint_test import TrailWalk

CHALLENGES = 'sources/map-research/sites-branch-hunts.json'
LAKE_CHALLENGES = 'sources/map-research/sites-fontaine-lake-legends.json'
DRY_CHALLENGES = 'sources/map-research/sites-fontaine-dry-legends.json'


def read(path):
    return json.loads((ROOT / path).read_text(encoding='utf-8-sig'))


def write(path, data):
    (ROOT / path).write_text(json.dumps(data, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')


graph = read('content/story-graph.json')
nodes = {n['id']: n for n in graph['nodes']}
quests = {q['id']: q for q in graph['quests']}
exits = {n['id']: n['exits'] for n in graph['nodes']}
edges = {(host, e['to']): e for host, values in exits.items() for e in values}
specs = {s['id']: s for s in read('content/field-boss-spawns.json')['fieldBosses']}
design = {s['encounter_id']: s for s in read('design/world/encounters.json')['legends']}
lua, core = runtime()
idle = lua.table()
batch = lua.eval('function(C,s,n) for _=1,n do C.step(s,1/60,{}) end end')


def exp(level):
    return LEVELS[level-1]['maple_reference_total_exp_to_reach']


def ready(level, camp, host):
    s = core.new(12)
    core.action(s, 'story_start')
    core.grantExp(s, exp(level), 'quest')
    core.enterStoryNode(s, camp)
    core.enterStoryNode(s, host)
    return s, TrailWalk(lua, core, s, edges, exits)


def cross(walk, to):
    for actor in walk.state.actors.values():
        actor.inv = 1000
    walk.cross(to)


def check_gate(s, walk, target, label):
    edge = edges[s.story.node, target]
    walk.approach(edge['x'], edge.get('y', 480), target)
    prompt = core.frame(s).storyNearbyPortal
    assert prompt.to == target and not prompt.available and label in prompt.reason
    old = s.story.node
    core.action(s, 'story_nearby_portal')
    assert s.story.node == old and not s.lift


def report_current(s, walk, quest):
    report_at = quests[quest]['hub']
    core.action(s, 'story_fast:' + report_at)
    assert s.story.node == report_at
    core.action(s, 'story_accept:' + quest)
    for i, step in enumerate(quests[quest]['itinerary'], 1):
        if step['kind']=='arrive':
            if s.story.node != step['from']:
                if (s.story.node,step['from']) in edges:
                    cross(walk, step['from'])
                else:
                    core.action(s, 'story_fast:' + step['from'])
                    assert s.story.node == step['from']
            cross(walk, step['node'])
        else:
            assert s.story.node == step['node']
            walk.approach(step['x'], step['y'], quest)
            core.action(s, 'story_collect')
        assert s.story.quests[quest].count == i, (step, s.storyNotice)
    core.action(s, 'story_fast:' + report_at)
    core.action(s, 'story_report:' + quest)
    assert s.story.quests[quest].status == 'complete'


def step_to(slot, s, condition, allowance=900):
    for _ in range(allowance):
        if condition(slot):
            return
        core.step(s, 1/60, idle)
    raise AssertionError((s.story.node, slot.phase, slot.index))


def normal_clear(r, spec):
    fixture = read(f'work/{r["stage"]}-fixture.json')
    s = core.restore(lua.table_from(fixture,recursive=True),12)
    walk = TrailWalk(lua,core,s,edges,exits)
    approach = r.get('approach',[r['host']])
    core.action(s, 'story_fast:' + approach[0])
    for node in approach[1:]:
        walk.cross(node)
    walk.cross(r['stage'])
    s.actors[2].hp = 0  # Single-character play for this fixture.
    hero = s.actors[1]
    slot = s.fieldSlots[r['id']]
    b = slot.enemy
    movements = {(direction,attack):lua.table_from({
        'left':direction<0,'right':direction>0,'attack':attack,'jump':True})
        for direction in (-1,0,1) for attack in (False,True)}
    start = s.t
    experienced = set()
    for _ in range(180*60):
        if b.hp<=0:
            assert len(experienced)==3
            return {'seconds':round(s.t-start,2),'hp':hero.hp,'moves':sorted(experienced)}
        bodies = [b,b.fieldPartner] if b.fieldPartner else [b]
        target = min(bodies,key=lambda unit:abs(hero.x-unit.x))
        dx = target.x-hero.x
        turn = abs(dx)>8 and dx*hero.dir<0
        direction = (1 if dx>0 else -1) if abs(dx)>87 or turn else 0
        evading = False
        if c := slot.cast:
            experienced.add(c.move.id)
            for attack in c.strikes.values():
                step = attack.step
                start_in = step.first-c.tick
                if not attack.left-12<=hero.x<=attack.right+12:
                    continue
                if step.height>=110 and -12<start_in<=33:
                    direction = -1 if hero.x<(attack.left+attack.right)/2 else 1
                    evading = True
                    break
                if step.wave:
                    direction_sign = 1 if attack.to>attack['from'] else -1
                    speed = abs(attack.to-attack['from'])/(step.after-step.first)
                    if speed>0:
                        distance = direction_sign*(hero.x-attack['from'])
                        if distance < -step.radius or distance > speed*(step.after-step.first)+step.radius:
                            continue
                        relative_speed = speed-direction*direction_sign*4.8
                        remaining = direction_sign*(hero.x-attack.position)-step.radius-12
                        start_in = max(0,start_in) + max(0,remaining)/max(1,relative_speed)
                if 8<=start_in<=13 and hero.ground:
                    core.action(s,'jump')
                    break
        core.step(s,1/60,movements[direction,abs(dx)<116 and not turn and not evading])
        assert s.returns==0 and hero.hp>0, (r['id'],s.t-start,b.hp,hero.hp)
    raise AssertionError((r['id'],b.hp,hero.hp))


evidence = {}
layouts = {
    'assets/legend-poses-v2-layout.json': 2,
    'assets/fontaine-dry-legend-poses-v1-layout.json': 1,
}
for path, revision in layouts.items():
    layout = read(path)
    for frame in layout['frames']:
        asset = read(f"assets/{frame['id']}-field-{frame['pose']}-sprites-v{revision}.json")
        left, top, width, height = asset['box']
        crop_x, crop_y, _, _ = frame['crop']
        pivot_x, pivot_y = frame['pivot']
        assert asset['source'] == layout['source']
        assert top + height == crop_y + pivot_y
        assert abs(left+asset['anchorX']*width-(crop_x+pivot_x)) < 1e-7
        hover = 12 if frame['id'].startswith('lake-') else 14 if frame['id']=='legend-gravity-device' else 0
        if hover:
            assert pivot_y - frame['opaque_box'][3] == hover
            for profile in asset['profiles'].values():
                assert max(r[1]+r[3] for r in profile['runs']) < profile['height']


entries = [(entry, manifest['art_source'])
           for manifest in map(read, (CHALLENGES, LAKE_CHALLENGES, DRY_CHALLENGES))
           for entry in manifest['legends']]
for r, source_art in entries:
    id, stage, host = r['id'], r['stage'], r['host']
    spec = specs[id]
    origin = nodes[host]['checkpoint']
    assert design[id]['level'] == spec['level'] == nodes[stage]['level']
    approach = r.get('approach',[host])
    assert approach[-1] == host
    assert design[id]['field_anchor_id'] == nodes[approach[0]]['mapPoint']
    assert not design[id]['counts_for_regional_daily']
    assert spec['manualRechallenge'] and nodes[stage]['peaceful'] and not nodes[stage].get('swim')
    assert [e['to'] for e in exits[stage]] == [host]
    s, walk = ready(spec['level']-1, origin, approach[0])
    for step in approach[1:]:
        cross(walk, step)
    check_gate(s, walk, stage, str(spec['level']))
    core.grantExp(s, exp(spec['level'])-exp(spec['level']-1), 'quest')
    if r['prerequisite']:
        check_gate(s, walk, stage, '依頼')
        if r.get('approach'):
            write(f'work/{stage}-before-report-fixture.json', validate_save(native(core.checkpoint(s))))
        report_current(s, walk, r['prerequisite'])
        core.action(s, 'story_fast:' + approach[0])
        for step in approach[1:]:
            cross(walk, step)
        assert s.story.node == host

    write(f'work/{stage}-fixture.json', validate_save(native(core.checkpoint(s))))
    core.action(s, 'world_map_toggle')
    core.action(s, 'world_map_layer:hunt')
    core.action(s, 'world_map_select:' + stage)
    atlas = core.frame(s).worldMap
    assert atlas.selected.id == stage and atlas.selected.huntKind == 'elite'
    if r.get('approach'):
        assert s.storySwimming and edges[stage,host].get('waterwaySeconds')
    assert atlas.guide.status == 'ready' and atlas.guide.stops[1].id == stage
    core.action(s, 'world_map_close')
    cross(walk, stage)
    assert not s.storySwimming and len(s.enemies) == design[id]['simultaneous_member_count']
    slot = s.fieldSlots[id]
    boss = slot.enemy
    hero = s.actors[1]
    s.actors[2].hp=0
    hero.x=140
    for _ in range(90):
        core.step(s, 1/60, idle)
    assert slot.phase=='available' and hero.hp==hero.maxhp
    hero.x=spec['home']-185
    step_to(slot, s, lambda e: e.cast is not None)
    cast = slot.cast
    preview = core.frame(s, 'sprite', 'legacy')
    rendered = [d for d in preview.draws.values() if d.source==source_art]
    assert len(rendered)==r['members'] and all(d.y==480 for d in rendered)
    counts = {'png':len(rendered)}
    for profile in ['legacy','h48c32','h32c16']:
        counts[profile]=core.frame(s,'rect',profile).commands
    assert counts['h32c16'] < counts['h48c32'] < counts['legacy']
    if r['members']==2:
        assert [b.element for b in preview.fieldBoss.bodies.values()]==['pyro','cryo']

    tested=[]
    for move in spec['moves']:
        assert cast.move.id==move['id']
        for i, phase in enumerate(move['steps'], 1):
            strike=cast.strikes[i]
            assert spec['arenaMin']<=strike.left<strike.right<=spec['arenaMax']
            step_to(slot,s,lambda e: cast.tick>=phase['first']-1)
            hero.x=strike['from'] if phase.get('travel') else (strike.left+strike.right)/2
            hero.y,hero.hp,hero.inv=480,hero.maxhp,0
            before=hero.hp
            core.step(s,1/60,idle)
            if phase.get('wave'):
                owner_x = strike.owner.x
                assert hero.hp==before and abs(strike.activeRight-strike.activeLeft) < strike.right-strike.left
                assert strike.position != strike['from']
                step_to(slot,s,lambda e: strike.seen[1],phase['after']-phase['first'])
                assert strike.owner.x==owner_x, 'A detached wave moved its owner'
            assert hero.hp==before-phase['damage'] and strike.seen[1]
            hero.inv=0
            core.step(s,1/60,idle)
            assert hero.hp==before-phase['damage']
        tested.append(move['id'])
        step_to(slot,s,lambda e: e.cast is None)
        if move!=spec['moves'][-1]:
            hero.inv=1000
            hero.x=boss.x-140 if boss.x-140>=spec['arenaMin'] else boss.x+140
            step_to(slot,s,lambda e: e.cast is not None)
            cast=slot.cast

    # The room resets on retreat, including a cast already in its warning phase.
    hero.inv=1000
    hero.x=boss.x-145 if boss.x-145>=spec['arenaMin'] else boss.x+145
    step_to(slot,s,lambda e: e.cast is not None)
    cross(walk,host)
    if r.get('approach'):
        assert s.storySwimming and s.actors[1].y==edges[stage,host]['arrivalY']
    assert s.fieldSlots[id] is None
    assert not any(e.fieldBoss for e in s.enemies.values())
    cross(walk,stage)
    slot=s.fieldSlots[id]
    boss=slot.enemy
    assert slot.phase=='available' and boss.hp==boss.maxhp
    hero=s.actors[1]
    s.actors[2].hp=0
    hero.x=boss.x-175
    step_to(slot,s,lambda e: e.cast is not None)
    step_to(slot,s,lambda e: e.cast.tick>=e.cast.strikes[1].step.after)
    # Use the normal attack path on the solo body or on the second linked body.
    target=boss.fieldPartner if boss.fieldPartner else boss
    hero.x,hero.y,hero.dir,hero.lock=target.x-24,target.y,1,0
    hero.cd.normal=0
    boss.hp=1
    before_kills,before_xp,before_mora=s.kills,s.progression.killXp,s.mora
    assert core.attack(s,hero,'normal')
    core.step(s,1/60,idle)
    assert boss.hp==0 and target.hp==0 and slot.phase=='cleared'
    reward=LEVELS[spec['level']-1]['normal_enemy_base_exp']*RUNTIME_EXP['roles']['field_boss']
    assert (s.kills-before_kills,s.progression.killXp-before_xp,s.mora-before_mora)==(1,int(reward+.5),spec['mora'])
    assert s.endgame.bosses[id].clears==1
    core.onKill(s,boss)
    batch(core,s,3610)
    assert s.kills==before_kills+1 and boss.hp==0 and slot.phase=='cleared'
    save=validate_save(native(core.checkpoint(s)))
    assert id not in save.get('fieldBosses', {})
    restored=core.restore(lua.table_from(save,recursive=True))
    assert restored.story.node==origin and restored.endgame.bosses[id].clears==1
    cross(walk,host)
    cross(walk,stage)
    assert s.fieldSlots[id].enemy.hp==spec['hp'] and s.endgame.bosses[id].clears==1
    evidence[id]={'moves_hit_once_in_their_windows':tested,'level':spec['level'],'bodies':r['members'],
                  'png_bodies_and_scene_draw_counts':counts, 'normal_attack_clear':normal_clear(r,spec)}

write('evidence/sites-branch-legends-lua.json',{
    'encounters':evidence,'entry_level_and_exploration_requirement':True,
    'dry_floor':True,'water_intake_and_authored_floor_pivots':True,
    'real_round_trips_and_retreat_during_warning':True,
    'manual_retry_only_and_single_reward':True,'saved_boss_record':True,
    'source_assets':sorted({asset for _,asset in entries}),
    'detached_wave_travel_and_impact_verified':True,'hit_and_reward_fixtures_used':True,
})
print(f'{len(entries)} optional encounters passed entry, move windows, retreat, manual retry, reward and save checks.')
