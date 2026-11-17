"""Check the gathering loop, both flavors, the market stall and save rules."""
from copy import deepcopy
import json

from runtime import ROOT, native, runtime
from savegame import validate_save

lua, core = runtime()
qid = 'liyue-harbor-meal'
harbor, river, cliff, field = 'liyue-harbor', 'liyue-river-trail', 'liyue-cliff-planks', 'liyue-field'
s = core.new(12)
core.action(s, 'story_start')
core.grantExp(s, sum(core.expNeeded(level) for level in range(1, 20)), 'quest')
core.enterStoryNode(s, harbor)
core.action(s, 'story_accept:'+qid)
assert not s.story.quests[qid]
initial = native(core.checkpoint(s))
initial['story']['quests']['liyue-market-delivery'] = {
    'status': 'complete', 'count': 3, 'cycles': 1,
    'delivery': {'guardCleared': True, 'recovered': True,
                 'delivered': {'pot': True, 'vessel': True, 'wheel': True}},
}
initial['mora'] = 300
validate_save(initial)
(ROOT/'work').mkdir(exist_ok=True)
(ROOT/'work/liyue-s02-fixture.json').write_text(json.dumps(initial), encoding='utf8')


def load(data):
    return core.restore(lua.table_from(validate_save(data), recursive=True))


def save():
    return validate_save(native(core.checkpoint(s)))


def step(**keys):
    core.step(s, 1/60, lua.table_from(keys))


def walk(x, attack=False):
    for _ in range(750):
        actor = s.actors[s.active]
        if abs(actor.x-x) < 8:
            return
        step(right=actor.x<x, left=actor.x>x, attack=attack)
    raise AssertionError(('walk', s.story.node, x))


def jump(y):
    core.action(s, 'jump')
    for _ in range(120):
        step(jump=True)
        actor = s.actors[s.active]
        if actor.ground and actor.y == y:
            return
    raise AssertionError(('jump', s.story.node, y))


def through(node):
    gate = core.frame(s).storyNearbyPortal
    assert gate and gate.to == node and gate.available, native(gate)
    core.action(s, 'story_nearby_portal')
    assert s.story.node == node


def gather(id):
    assert core.frame(s).storyNearbyIngredient.id == id
    core.action(s, 'story_collect')
    assert s.story.quests[qid].cooking.gathered[id]
    core.action(s, 'story_collect')
    assert not core.frame(s).storyNearbyIngredient


s = load(initial)
walk(955)
assert not core.frame(s).storyNearbyPortal.available
core.action(s,'story_accept:'+qid)
q = s.story.quests[qid]
through(river)
walk(365, attack=True)
gather('fish')
walk(1660, attack=True)
assert not core.frame(s).storyNearbyPortal.available  # The caravan's route stays locked.
assert not s.story.quests['liyue-caravan-search']
s = load(save())
q = s.story.quests[qid]
assert s.story.node == harbor and q.count == 1 and q.cooking.gathered.fish

walk(490)
jump(350)
through(cliff)
walk(510, attack=True)
jump(395)
jump(305)
walk(560)
gather('herb')
walk(110)
through(harbor)
walk(1380)
through(field)
walk(270)
gather('mushroom')
walk(110)
through(harbor)
assert q.count == 3
core.action(s, 'story_cook:'+qid+':herbal')
assert not q.cooking.flavor
walk(245)
assert core.frame(s).storyCooking.choosing
ready = save()
recipes = []
for flavor in ('herbal','spicy'):
    s = load(deepcopy(ready))
    walk(245)
    q = s.story.quests[qid]
    core.action(s, 'story_cook:'+qid+':unknown')
    assert q.count == 3
    core.action(s, 'story_cook:'+qid+':'+flavor)
    assert q.count == 4 and q.cooking.flavor == flavor and q.cooking.meals == 0
    core.action(s, 'story_buy_meal:'+qid)
    assert q.cooking.meals == 0
    cash, xp = s.mora, s.progression.questXp
    core.action(s, 'story_report:'+qid)
    core.action(s, 'story_report:'+qid)
    assert (q.status,q.cooking.meals,s.mora,s.progression.questXp) == ('complete',1,cash+180,xp+7931)
    recipes.append((core.frame(s).storyCooking.meal, core.frame(s).storyCooking.price, core.frame(s).storyCooking.heal))
    saved = save()
    bad = deepcopy(saved)
    bad['story']['quests'][qid]['cooking']['meals'] = 6
    try:
        validate_save(bad)
    except ValueError:
        pass
    else:
        raise AssertionError('Invalid stock survived validation')
    s = load(saved)
    q = s.story.quests[qid]
    a = s.actors[s.active]
    assert q.cooking.flavor == flavor
    core.action(s, 'story_buy_meal:'+qid)
    assert q.cooking.meals == 1
    walk(245)
    cash = s.mora
    for _ in range(6):
        core.action(s, 'story_buy_meal:'+qid)
    assert q.cooking.meals == 5 and s.mora == cash-180
    a.hp = a.maxhp
    core.action(s, 'story_eat_meal:'+qid)
    assert q.cooking.meals == 5
    a.hp = 0
    core.action(s, 'story_eat_meal:'+qid)
    assert q.cooking.meals == 5 and a.hp == 0
    a.hp = a.maxhp-10
    core.action(s, 'story_eat_meal:'+qid)
    assert q.cooking.meals == 4 and a.hp == a.maxhp
    s.mora = 44
    core.action(s, 'story_buy_meal:'+qid)
    assert q.cooking.meals == 4 and s.mora == 44
    a.hp = a.maxhp-45
    core.action(s, 'pause')
    core.action(s, 'story_eat_meal:'+qid)
    assert q.cooking.meals == 4 and a.hp == a.maxhp-45
    core.action(s, 'pause')
    core.action(s, 'story_eat_meal:'+qid)
    assert q.cooking.meals == 3 and a.hp == a.maxhp-10
    walk(1380)
    through(field)
    a.inv=0
    hp=a.hp
    assert core.damageActor(s,a,40,None,False,False)==40
    assert core.frame(s).storyCooking.canEat
    core.action(s,'story_eat_meal:'+qid)
    assert a.hp==hp-5 and q.cooking.meals==2
assert recipes[0][0] != recipes[1][0] and recipes[0][1:] == recipes[1][1:] == (45, 35)

market = save()
market['mora'] = 160
market['story']['quests']['liyue-caravan-search'] = {
    'status':'complete', 'count':3, 'cycles':1, 'inspected':{'caravan':True,'cart-ruts':True},
}
market['story']['quests']['liyue-market-opening'] = {'status':'complete','count':3,'cycles':1}
s = load(market)
walk(245)
assert core.frame(s).storyCooking.price is None
walk(925)
assert core.frame(s).storyMarketOpen and core.frame(s).storyCooking.price == 45
core.action(s,'story_buy_meal:'+qid)
assert s.story.quests[qid].cooking.meals == 3

(ROOT/'evidence/liyue-s02-lua.json').write_text(json.dumps({
    'M01_required_M02_independent': True, 'normal_inputs_gather_all_three': True,
    'caravan_deeper_gate_unchanged': True, 'partial_save': True,
    'flavors_differ_cosmetically_with_same_cost_and_healing': True,
    'stall_moves_at_market_opening': True, 'limit_and_insufficient_funds': True,
    'healing_after_field_damage_and_full_dead_paused_rejected': True,
    'one_time_reward': {'xp':7931,'mora':180,'free_meals':1},
}, indent=2)+'\n', encoding='utf8')
print('Liyue S02 gathering, both flavors, market, purchase, healing and checkpoints passed')
