"""Play both permanent harbor shortcuts from the same surveyed checkpoint."""
from copy import deepcopy
import json

from runtime import ROOT, native, runtime
from savegame import validate_save

lua, core = runtime()
qid = 'liyue-hauling-shortcut'
port, field, post = 'liyue-harbor', 'liyue-field', 'liyue-quarry-post'
road, lift = 'liyue-cart-road', 'liyue-cart-lift'
s = core.new(12)
core.action(s, 'story_start')
core.grantExp(s, sum(core.expNeeded(level) for level in range(1, 20)), 'quest')
core.enterStoryNode(s, port)
core.action(s, 'story_accept:'+qid)
assert not s.story.quests[qid]
seed = native(core.checkpoint(s))
seed['story']['quests'] = {
    'liyue-market-delivery': {
        'status':'complete', 'count':3, 'cycles':1,
        'delivery':{'guardCleared':True, 'recovered':True, 'delivered':{'pot':True,'vessel':True,'wheel':True}},
    },
    'liyue-caravan-search': {
        'status':'complete', 'count':3, 'cycles':1, 'inspected':{'cart-ruts':True,'caravan':True},
    },
}
validate_save(seed)
(ROOT/'work').mkdir(exist_ok=True)
(ROOT/'work/liyue-s05-fixture.json').write_text(json.dumps(seed), encoding='utf8')


def load(data):
    return core.restore(lua.table_from(validate_save(data),recursive=True))


def save():
    return validate_save(native(core.checkpoint(s)))


def step(**keys):
    core.step(s,1/60,lua.table_from(keys))


def walk(x, attack=False):
    for _ in range(750):
        actor=s.actors[s.active]
        if abs(actor.x-x)<8:
            return
        step(right=actor.x<x,left=actor.x>x,attack=attack)
    raise AssertionError(('walk',s.story.node,x))


def jump(y, x=None):
    core.action(s,'jump')
    for _ in range(120):
        actor=s.actors[s.active]
        step(jump=True,right=x is not None and actor.x<x-4)
        if actor.ground and actor.y==y:
            return
    raise AssertionError(('jump',s.story.node,y,actor.x,actor.y))


def gate(node):
    near=core.frame(s).storyNearbyPortal
    assert near and near.to==node, native(near)
    return near


def through(node, pause_ride=False):
    assert gate(node).available
    core.action(s,'story_nearby_portal')
    if pause_ride:
        ride=s.lift
        assert ride and ride.seconds==1.8
        core.action(s,'pause')
        for _ in range(30):
            step(right=True)
        assert s.lift.remaining==1.8
        core.action(s,'pause')
    for _ in range(150):
        if s.story.node==node:
            return
        assert s.lift
        step()
    raise AssertionError(('portal',node))


def interact(label):
    assert label in core.frame(s).storyNearbyConstruction.label
    core.action(s,'story_collect')


def choose(plan):
    core.action(s,'story_construction_plan:'+qid+':'+plan)


s=load(seed)
walk(170)
assert not gate(road).available
walk(840)
assert not gate(lift).available
core.action(s,'story_accept:'+qid)
q=s.story.quests[qid]
walk(855)
core.action(s,'story_collect')
assert q.count==0  # Right horizontal position under the roof is insufficient.
walk(558)
jump(350)
walk(570)
jump(300,780)
walk(855)
interact('屋根')
assert q.count==1 and '荷車を引いては通れません' in s.storyNotice
walk(1300)
for _ in range(60):
    step()
interact('遠回り')
walk(1165)
through(post)
walk(1535)
interact('昇降台')
assert q.count==3
walk(1655)
through(port)
surveyed=save()

verified=[]
for plan,route,entry,other,other_x,far_x in (
    ('ground',road,170,lift,840,1320),('lift',lift,840,road,170,1110),
):
    s=load(deepcopy(surveyed))
    q=s.story.quests[qid]
    choose(plan)
    assert not q.construction.plan
    walk(875)
    interact('施工案')
    choose('roof')
    assert q.count==3
    choose(plan)
    other_plan='lift' if plan=='ground' else 'ground'
    choose(other_plan)
    assert q.count==4 and q.construction.plan==plan
    s=load(save())
    q=s.story.quests[qid]
    assert q.construction.plan==plan and q.count==4
    if plan=='ground':
        walk(170)
        assert not gate(road).available
    else:
        walk(1165)
        through(post)
        walk(1535)
    interact('片付け')
    interact('資材')
    assert q.count==6
    if plan=='lift':
        walk(1655)
        through(port)
    walk(entry)
    assert not gate(route).available
    cash,xp=s.mora,s.progression.questXp
    core.action(s,'story_report:'+qid)
    core.action(s,'story_report:'+qid)
    assert (q.status,q.cycles,s.mora,s.progression.questXp)==('complete',1,cash+240,xp+1800)
    finished=save()
    bad=deepcopy(finished)
    bad['story']['quests'][qid]['construction']['plan']='roof'
    try:
        validate_save(bad)
    except ValueError:
        pass
    else:
        raise AssertionError('Unsuitable roof accepted as a completed plan')
    s=load(finished)
    walk(other_x)
    assert not gate(other).available
    walk(entry)
    through(route,pause_ride=plan=='lift')
    assert len(s.enemies)==0
    a=s.actors[s.active]
    assert a.y==(350 if plan=='lift' else 480)
    cart1=native(core.frame(s).storyHaulCart)
    for _ in range(45):
        step()
    cart2=native(core.frame(s).storyHaulCart)
    assert cart1['route']==plan and cart1!=cart2
    walk(870 if plan=='ground' else 535)
    for _ in range(60):
        step()
    through(field)
    assert s.actors[s.active].x==1280  # Exit near the outer edge, far beyond the old gate's entry.
    walk(far_x)
    through(route)
    if plan=='lift':
        walk(180)
        jump(350)
    else:
        walk(110)
    through(port)
    assert s.story.quests[qid].construction.plan==plan
    verified.append({'plan':plan,'bidirectional':True,'cart_animation':True,'exclusive':True})

(ROOT/'evidence/liyue-s05-lua.json').write_text(json.dumps({
    'M02_prerequisite':True,'all_survey_positions_with_normal_movement':True,
    'roof_rejected_for_carts':True,'choice_saved_before_construction':True,
    'construction_then_report_opens_one_route':True,'routes':verified,
    'lift_pause_and_safe_elevated_arrival':True,
    'same_one_time_reward':{'xp':1800,'mora':240},
},indent=2)+'\n',encoding='utf8')
print('Liyue S05 all surveys and both saved, exclusive, bidirectional routes passed')
