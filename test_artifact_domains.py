"""Play all eight domain ranks through normal combat and validate the rewards."""

import json
from collections import Counter
from copy import deepcopy

from experience import LEVELS
from runtime import ROOT, native, runtime
from savegame import validate_save
from tools.waypoint_test import TrailWalk


def read(path):
    return json.loads((ROOT / path).read_text(encoding='utf8'))


def write(path, data):
    (ROOT / path).write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf8')


config = read('content/artifact-domains.json')
nodes = {node['id']: node for node in read('content/story-graph.json')['nodes']}
exits = {id: node['exits'] for id, node in nodes.items()}
gates = {(id, edge['to']): edge for id, rows in exits.items() for edge in rows}
routes = {
    'ridge-watch': ['mond-border', 'sites-lookout-10009', 'ridge-watch-domain'],
    'windcrown': ['mond-wp-95782', 'sites-windcrown-waterfall', 'sites-lookout-98500', 'windcrown-domain'],
}
lua, core = runtime()
advance = lua.eval('function(C,s,n,input) for _=1,n do C.step(s,1/60,input) end end')
attack = lua.table(attack=True)
idle = lua.table()


def save(state):
    return validate_save(native(core.checkpoint(state)))


def setup(level, node):
    s = core.new(12)
    core.action(s, 'story_start')
    core.grantExp(s, LEVELS[level - 1]['maple_reference_total_exp_to_reach'], 'quest')
    core.enterStoryNode(s, nodes[node]['checkpoint'])
    for part in (1, 2):
        assert core.giveArtifact(s, part, level+20, 5, lua.table(subpair='hp_crit'))
        core.action(s, f'artifact_equip:{part}')
    core.enterStoryNode(s, node)
    return s, TrailWalk(lua, core, s, gates, exits)


def enter(spec, level):
    path = routes[spec['id']]
    state, walk = setup(level, path[0])
    core.action(state, 'artifact_domain_start:i:'+spec['sets'][0])
    assert not state.artifactDomainRun
    for place in path[1:]:
        walk.cross(place)
    assert core.frame(state).artifactDomain.status == 'ready' and len(state.enemies) == 0
    return state, walk


def start(state, rank, set_id):
    core.action(state, f'artifact_domain_start:{rank}:{set_id}')
    assert state.artifactDomainRun and state.artifactDomainRun.status == 'fighting'


def play(state, walk, rank=None):
    waves = {}
    for _ in range(800):
        run = state.artifactDomainRun
        assert run is not None, ('lost or left attempt', state.story.node)
        if run.status != 'fighting':
            assert run.status == 'clear'
            if rank:
                expected = [
                    Counter({config['enemies'][enemy]['name']: count for enemy, count in wave.items()})
                    for wave in rank['waves']
                ]
                assert list(waves.values()) == expected
            return run
        waves.setdefault(run.wave, Counter(enemy.storyName for enemy in state.enemies.values()))
        living = [enemy for enemy in state.enemies.values() if enemy.hp>0]
        if living:
            target = min(living, key=lambda enemy: abs(enemy.x-walk.actor.x))
            if abs(target.x-walk.actor.x)>55:
                inputs = walk.inputs['left' if target.x<walk.actor.x else 'right']
                advance(core,state,8,inputs)
            else:
                advance(core,state,12,attack)
        else:
            advance(core,state,1,idle)
    raise AssertionError('Failed to clear with ordinary movement and attack input')


def wallet(s):
    return s.progression.killXp,s.mora,len(s.inventory['items']),len(s.inventory.ground)


results = {}
for spec in config['domains']:
    results[spec['id']] = []
    fixture, _ = setup(spec['ranks'][-1]['level'], routes[spec['id']][0])
    write(f'work/{spec["id"]}-domain-fixture.json', save(fixture))
    for rank in spec['ranks']:
        state, walk = enter(spec, rank['level'])
        initial = wallet(state)
        chosen = spec['sets'][rank['id'] in ('ii','iv')]
        if rank == spec['ranks'][0]:
            core.action(state,'artifact_domain_start:iv:'+chosen)
            assert state.artifactDomainRun is None and '必要レベル' in state.storyNotice
            core.action(state,'artifact_domain_start:i:troupe')
            assert state.artifactDomainRun is None
        start(state,rank['id'],chosen)
        run = state.artifactDomainRun
        core.action(state,f'artifact_domain_start:{rank["id"]}:{chosen}')
        assert run.started == state.artifactDomainRun.started
        core.action(state,'world_map_toggle')
        advance(core,state,120,idle)
        assert state.t == run.started
        core.action(state,'world_map_close')
        run = play(state,walk,rank)
        reward = run.result
        expected_xp = LEVELS[rank['level']-1]['normal_enemy_base_exp']*rank['xpUnits']
        assert wallet(state) == (initial[0]+expected_xp,initial[1]+rank['mora'],initial[2]+1,initial[3])
        item = state.inventory['items'][len(state.inventory['items'])]
        assert (item.setId,item.slot,item.itemLv,item.rarity) == (chosen,1,rank['level']+20,rank['rarity'])
        advance(core,state,180,idle)
        assert wallet(state)[2:] == (initial[2]+1,initial[3])
        snapshot = save(state)
        id = spec['id']+':'+rank['id']
        record = snapshot['endgame']['artifactDomains'][id]
        assert record['clears']==1 and snapshot['inventory']['items'][-1]['setId']==chosen
        restored = core.restore(lua.table_from(snapshot,recursive=True),12)
        assert not restored.artifactDomainRun and restored.story.visited[spec['node']]
        assert restored.endgame.artifactDomains[id].bestTicks==record['bestTicks']
        for place in routes[spec['id']][-2::-1]:
            walk.cross(place)
        assert not state.artifactDomainRun and not core.frame(state).artifactDomain
        results[spec['id']].append({'rank':rank['id'],'set':chosen,'enemies':run.rank.count,
                                    'waves':run.wave,'bestTicks':record['bestTicks'],'xp':reward.xp,'mora':reward.mora})

ridge, wind = config['domains']
s, walk = enter(ridge,20)
before_attempt=wallet(s)
start(s,'i','tenacity')
enemy = s.enemies[1]
actor = walk.actor
actor.inv=0
actor.waterShield=lua.table(hp=90,maxhp=90,life=7,counters=3)
hp=enemy.hp
assert core.damageActor(s,actor,14,enemy,True,True)==0 and enemy.hp<hp
first=enemy.hp
actor.inv=0
core.damageActor(s,actor,14,enemy,True,True)
assert enemy.hp==first
s.t=s.artifactDomainRun.started+s.artifactDomainRun.rank.limit+1
advance(core,s,1,idle)
assert s.artifactDomainRun.status=='timeout' and wallet(s)==before_attempt
start(s,'i','tenacity')
play(s,walk)
start(s,'i','tenacity')
while len(s.inventory['items'])<80:
    assert core.giveArtifact(s,1,21,3)
run=play(s,walk)
assert run.result.held and len(s.inventory['items'])==80 and s.inventory.ground[1].zone=='town'
assert s.inventory.ground[1].item.slot==2 and s.inventory.ground[1].item.setId=='tenacity'
assert save(s)['endgame']['artifactDomains']['ridge-watch:i']['clears']==2
wrong=deepcopy(save(s))
wrong['endgame']['artifactDomains']['ridge-watch:i']['bestTicks']=999999
try:
    validate_save(wrong)
except ValueError:
    pass
else:
    raise AssertionError('accepted a time outside the domain limit')

s, walk = enter(wind,184)
before_attempt=wallet(s)
start(s,'iv','deepShadow')
enemy=s.enemies[1]
actor=walk.actor
cast=lua.table(id=actor.id,isNormal=True)
core.afterElementHit(s,cast,enemy,'physical','physical',1)
core.afterElementHit(s,cast,enemy,'physical','physical',1)
assert len(s.artifactDomainRun.chain)==1
for _ in range(3):
    core.afterElementHit(s,lua.table(id=actor.id),enemy,'pyro','pyro',1)
assert enemy.resist.pyro==.55
assert s.enemies[2].resist.pyro is None
core.action(s,'swap')
advance(core,s,1,idle)
assert len(s.artifactDomainRun.chain)==0
walk.cross(routes['windcrown'][-2])
assert s.artifactDomainRun is None and wallet(s)==before_attempt


def equip_pair(set_id):
    state=core.new(12)
    core.action(state,'campaign')
    for slot in (1,2):
        assert core.giveArtifact(state,slot,40,4,lua.table(setId=set_id))
        core.action(state,f'artifact_equip:{slot}')
    restored=core.restore(lua.table_from(save(state),recursive=True),12)
    assert restored.actors[1].setCounts[set_id]==2 and (restored.actors[2].setCounts[set_id] or 0)==0
    return restored


base=equip_pair('gladiator')
health=equip_pair('tenacity')
assert health.actors[1].maxhp==int(base.actors[1].maxhp*1.2)
pale=equip_pair('paleFlame')
shadow=equip_pair('deepShadow')
blow=lua.table(id=1,atk=100,isNormal=True)
target=lua.table(defense=0)
assert core.enemyHitDamage(pale,blow,target,1,'physical',0)[0]==125
assert core.enemyHitDamage(shadow,blow,target,1,'physical',0)[0]==100
target.physicalBreak=1
assert core.enemyHitDamage(shadow,blow,target,1,'physical',0)[0]==140
gift=equip_pair('celestialGift')
core.action(gift,'field')
target=gift.enemies[1]
actor=gift.actors[1]
actor.x=target.x-38
before=gift.gauge
assert core.attack(gift,actor,'normal') and gift.gauge==before+3

write('evidence/artifact-domains-lua.json',{
    'results':results,'actualCombatInputs':True,'timeoutAndAbandonUnpaid':True,'sameRankRepeatAndPendingTownDrop':True,
    'shieldRetaliationCooldown':True,'chainResetsOnSwap':True,'keeperResistancePerEnemy':True,'checkpointRestoresHistory':True,
    'fourSetsEquipAndRestoreTwoPieceEffects':True,
})
print('8 artifact domain ranks: combat, clears, full-bag claim, retry and save passed')
