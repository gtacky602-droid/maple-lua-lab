"""Play Xingqiu's quest through its two landmarks, camp, and optional reading."""
from copy import deepcopy
import json

from runtime import ROOT, native, runtime
from savegame import validate_save

lua, core = runtime()
qid = 'liyue-book-rescue'
port, field, camp = 'liyue-harbor', 'liyue-field', 'liyue-book-camp'
s = core.new(12)
core.action(s, 'story_start')
core.grantExp(s, sum(core.expNeeded(level) for level in range(1, 20)), 'quest')
core.enterStoryNode(s, port)
core.action(s, 'story_accept:'+qid)
assert not s.story.quests[qid]
seed = native(core.checkpoint(s))
seed['story']['quests']['liyue-market-delivery'] = {
    'status':'complete', 'count':3, 'cycles':1,
    'delivery':{'guardCleared':True, 'recovered':True, 'delivered':{'pot':True,'vessel':True,'wheel':True}},
}
validate_save(seed)
(ROOT/'work').mkdir(exist_ok=True)
(ROOT/'work/liyue-s03-fixture.json').write_text(json.dumps(seed), encoding='utf8')


def load(data):
    return core.restore(lua.table_from(validate_save(data), recursive=True))


def save():
    return validate_save(native(core.checkpoint(s)))


def step(**keys):
    core.step(s,1/60,lua.table_from(keys))


def walk(x, attack=False):
    for _ in range(750):
        a=s.actors[s.active]
        if abs(a.x-x)<8:
            return
        step(right=a.x<x,left=a.x>x,attack=attack)
    raise AssertionError(('walk',s.story.node,x))


def jump(y):
    core.action(s,'jump')
    for _ in range(120):
        step(jump=True)
        a=s.actors[s.active]
        if a.ground and a.y==y:
            return
    raise AssertionError(('jump',s.story.node,y))


def through(node):
    gate=core.frame(s).storyNearbyPortal
    assert gate and gate.to==node and gate.available, native(gate)
    core.action(s,'story_nearby_portal')
    assert s.story.node==node


def inspect(id):
    assert core.frame(s).storyNearbyBook.id==id
    core.action(s,'story_collect')


def fight(id):
    for _ in range(520):
        if q.book.defeated[id]:
            return
        step(attack=True)
    raise AssertionError(('fight',id))


s=load(seed)
core.action(s,'story_accept:'+qid)
q=s.story.quests[qid]
walk(1380)
through(field)
walk(530,attack=True)
inspect('proof-sheet')
assert q.count==1 and core.frame(s).storyBook.proof
walk(820,attack=True)
jump(350)
inspect('forked-tree')
assert q.count==1 and core.frame(s).storyBook.proof
walk(1120,attack=True)
for _ in range(60):
    step()
jump(390)
walk(1220)
assert not core.frame(s).storyNearbyPortal.available
walk(1120)
inspect('stone-arch')
assert q.count==2 and not core.frame(s).storyBook
walk(1220)
through(camp)
assert len(s.enemies)==3
sprite=core.enemyIdleArt['treasure-scout'].source
assert any(draw.source==sprite for draw in core.frame(s,'sprite','legacy').draws.values())
walk(415,attack=True)
fight('liyue-book-scout-1')
for _ in range(450):
    step()
assert q.count==2 and s.enemies[1].hp==0

s=load(save())
q=s.story.quests[qid]
assert s.story.node==port and q.book.defeated['liyue-book-scout-1']
walk(1380)
through(field)
walk(1220,attack=True)
jump(390)
through(camp)
assert {e.spawnId for e in s.enemies.values()}=={'liyue-book-scout-2','liyue-book-scout-3'}
walk(1250)
if q.count==2:
    inspect('print-crate')
    assert q.count==2
walk(1030,attack=True)
fight('liyue-book-scout-3')
walk(840,attack=True)
jump(392)
fight('liyue-book-scout-2')
assert q.count==3 and len(s.enemies)==0
walk(1250)
for _ in range(60):
    step()
inspect('print-crate')
assert q.count==4 and not core.frame(s).storyNearbyBook
walk(110)
through(field)
walk(110,attack=True)
through(port)
cash,xp=s.mora,s.progression.questXp
core.action(s,'story_report:'+qid)
core.action(s,'story_report:'+qid)
assert (q.status,q.cycles,s.mora,s.progression.questXp)==('complete',1,cash+220,xp+16443)
walk(485)
assert not core.frame(s).storyBook
inspect('read-stand')
assert core.frame(s).storyBook.title=='石門を越えた侠客'
inspect('read-stand')
assert not core.frame(s).storyBook
finished=save()
bad=deepcopy(finished)
del bad['story']['quests'][qid]['book']['defeated']['liyue-book-scout-2']
try:
    validate_save(bad)
except ValueError:
    pass
else:
    raise AssertionError('Missing guard accepted as a finished fight')
s=load(finished)
walk(485)
assert core.frame(s).storyNearbyBook.id=='read-stand' and not core.frame(s).storyBook
walk(1380)
through(field)
walk(1220,attack=True)
jump(390)
through(camp)
assert len(s.enemies)==0

market=deepcopy(finished)
market['story']['quests']['liyue-caravan-search']={
    'status':'complete','count':3,'cycles':1,'inspected':{'caravan':True,'cart-ruts':True},
}
market['story']['quests']['liyue-market-opening']={'status':'complete','count':3,'cycles':1}
s=load(market)
walk(485)
assert not core.frame(s).storyNearbyBook
walk(665)
inspect('read-stand')
assert core.frame(s).storyBook.title=='石門を越えた侠客'

(ROOT/'evidence/liyue-s03-lua.json').write_text(json.dumps({
    'requires_M01':True,'wrong_landmark_can_be_retried':True,'camp_only_after_matching_print':True,
    'all_three_guards_once_with_normal_attacks':True,'midfight_save_retains_defeated_guards':True,
    'optional_reading_and_market_relocation':True,'no_repeat_fight_after_report':True,
    'one_time_reward':{'xp':16443,'mora':220},
},indent=2)+'\n',encoding='utf8')
print('Liyue S03 landmark, camp, partial save, book retrieval and optional reading passed')
