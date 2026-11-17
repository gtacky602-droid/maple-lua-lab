"""Play the harbor deliveries through the ordinary Lua controls."""
from copy import deepcopy
import json

from runtime import ROOT, native, runtime
from savegame import validate_save

lua, core = runtime()
qid='liyue-market-delivery'
graph=json.loads((ROOT/'content/story-graph.json').read_text(encoding='utf8'))
nodes={node['id']:node for node in graph['nodes']}
s=core.new(12)
core.action(s,'story_start')
core.enterStoryNode(s,'liyue-harbor')
core.action(s,'story_accept:'+qid)
assert not s.story.quests[qid]

s=core.new(12)
core.action(s,'story_start')
core.grantExp(s,sum(core.expNeeded(level) for level in range(1,20)),'quest')
assert s.progression.level==20


def step(**keys):
    core.step(s,1/60,lua.table_from(keys))


def walk(x,attack=False):
    for _ in range(800):
        actor=s.actors[s.active]
        if abs(actor.x-x)<8:
            return
        step(right=actor.x<x,left=actor.x>x,attack=attack)
    raise AssertionError(('cannot walk',s.story.node,x))


def gate(target):
    edge=next(edge for edge in nodes[s.story.node]['exits'] if edge['to']==target)
    walk(edge['x']+8)
    nearby=core.frame(s).storyNearbyPortal
    assert nearby and nearby.to==target and nearby.available,native(nearby)
    core.action(s,'story_nearby_portal')
    assert s.story.node==target


def submit(id):
    core.action(s,f'story_deliver:{qid}:{id}')


for target in ('mond-road','mond-border','liyue-entry','liyue-harbor'):
    gate(target)
assert len(s.story.quests)==0  # Regional travel does not require the previous chapter.
core.action(s,'companion:beidou')
core.action(s,'artifact_samples')
core.action(s,'artifact_equip:1')
checkpoint=validate_save(native(core.checkpoint(s)))
(ROOT/'work').mkdir(exist_ok=True)
(ROOT/'work/liyue-m01-fixture.json').write_text(json.dumps(checkpoint),encoding='utf8')
core.action(s,'story_accept:beidou-join')
assert not s.story.quests['beidou-join']
core.action(s,'story_accept:'+qid)
q=s.story.quests[qid]
core.action(s,'story_accept:beidou-join')
assert s.story.quests['beidou-join'].status=='active'
core.action(s,'story_accept:liyue-supply')
assert s.story.quests['liyue-supply'].status=='active'
submit('pot')
assert q.count==0
core.action(s,'story_report:'+qid)
assert q.status=='active'
walk(245)
submit('vessel')
assert q.count==0 and not q.delivery.delivered.vessel
submit('pot')
submit('pot')
assert q.count==1 and core.frame(s).storyShopStock.pot
walk(615)
submit('vessel')
assert q.count==2 and core.frame(s).storyShopStock.vessel
walk(1050)
submit('wheel')
assert q.count==2 and not core.frame(s).storyShopStock.wheel
partial=validate_save(native(core.checkpoint(s)))
restored=core.restore(lua.table_from(partial,recursive=True))
assert restored.story.quests[qid].delivery.delivered.pot
assert restored.story.quests[qid].delivery.delivered.vessel

# Only for the negative test, place the actor next to the cache with the guard alive.
core.enterStoryNode(restored,'liyue-loading-yard')
restored.actors[restored.active].x=735
restored.actors[restored.active].y=380
core.action(restored,'story_collect')
assert not restored.story.quests[qid].delivery.recovered
assert '見張り' in restored.storyNotice

gate('liyue-loading-yard')
walk(432,attack=True)
for _ in range(450):
    if q.delivery.guardCleared:
        break
    step(attack=True)
assert q.delivery.guardCleared
walk(735)
core.action(s,'jump')
for _ in range(120):
    step(jump=True)
    actor=s.actors[s.active]
    if actor.y==380 and actor.ground:
        break
assert core.frame(s).storyNearbyParcel.name=='車輪の荷箱'
core.action(s,'story_collect')
assert q.delivery.recovered and q.count==2
gate('liyue-harbor')
walk(1050)
submit('wheel')
assert q.count==3 and core.frame(s).storyShopStock.wheel

mora,xp=s.mora,s.progression.questXp
core.action(s,'story_report:'+qid)
core.action(s,'story_report:'+qid)
assert q.status=='complete' and q.cycles==1
assert (s.mora,s.progression.questXp)==(mora+300,xp+10929)
saved=validate_save(native(core.checkpoint(s)))
r=core.restore(lua.table_from(saved,recursive=True))
assert r.companion=='beidou'
assert [item['owner'] for item in saved['inventory']['items']]==[item['owner'] for item in checkpoint['inventory']['items']]
assert r.story.quests[qid].status=='complete' and core.frame(r).storyShopStock.wheel
assert r.story.quests['liyue-supply'].status=='active'

for falsify in ('guard','mismatched_count','unknown_parcel','underlevel'):
    bad=deepcopy(saved)
    quest=bad['story']['quests'][qid]
    if falsify=='guard':
        quest['delivery']['guardCleared']=False
    elif falsify=='mismatched_count':
        del quest['delivery']['delivered']['wheel']
    elif falsify=='unknown_parcel':
        quest['delivery']['delivered']['something']=quest['delivery']['delivered'].pop('wheel')
    else:
        bad['progression']['level']=19
    try:
        validate_save(bad)
    except ValueError:
        pass
    else:
        raise AssertionError(f'Accepted invalid save: {falsify}')

legacy=deepcopy(checkpoint)
legacy['story']['quests']['beidou-join']={'status':'active','count':2,'cycles':0}
assert core.restore(lua.table_from(validate_save(legacy),recursive=True)).story.quests['beidou-join'].count==2
checks={'level_gate':True,'arrival_without_previous_chapter':True,'wrong_and_remote_delivery_rejected':True,
        'stocked_three_stalls':True,'guarded_recovery_with_jump':True,'beidou_quest_available_at_acceptance':True,
        'existing_quest_and_gear_kept':True,'partial_and_complete_restore':True,
        'reward':{'xp':10929,'mora':300},'invalid_cargo_saves_rejected':4}
(ROOT/'evidence/liyue-m01-lua.json').write_text(json.dumps(checks,indent=2)+'\n',encoding='utf8')
print('Liyue M01 deliveries, cache, reward, and compatible gear/quest saves passed')
