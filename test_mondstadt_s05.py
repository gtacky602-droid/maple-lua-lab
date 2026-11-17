"""Practice the windmill tour and its paid quest with actual fixed-step movement."""
from copy import deepcopy
import json

from experience import LEVELS
from runtime import ROOT, native, runtime
from savegame import validate_save

lua, core = runtime()
qid = 'mond-windmill'
town, roof, view = 'mond-town','mond-roof-route','mond-windmill-lookout'
s = core.new(12)
core.action(s,'story_start')
core.action(s,'story_accept:'+qid)
assert not s.story.quests[qid]
seed = native(core.checkpoint(s))
seed['story']['quests']['amber-join'] = {'status':'complete','count':4,'cycles':1}
seed['story']['quests']['mond-old-trail'] = {
    'status':'complete','count':2,'cycles':1,'inspected':{'wheel-ruts':True}
}


def restore(data):
    return core.restore(lua.table_from(validate_save(data),recursive=True),12)


def save():
    return validate_save(native(core.checkpoint(s)))


def step(**buttons):
    core.step(s,1/60,lua.table_from(buttons))


def walk(x):
    for _ in range(600):
        a=s.actors[s.active]
        if abs(a.x-x)<5:
            return
        step(right=a.x<x,left=a.x>x)
    raise AssertionError(('walk',x,s.story.node))


def jump(y):
    core.action(s,'jump')
    for _ in range(140):
        step(jump=True)
        a=s.actors[s.active]
        if a.ground and a.y==y:
            return
    raise AssertionError(('jump',y,s.story.node))


def gate(target,available=True):
    p=core.frame(s).storyNearbyPortal
    assert p.to==target and p.available==available,native(p)
    if available:
        core.action(s,'story_nearby_portal')
        assert s.story.node==target


def interact(label):
    p=core.frame(s).storyNearbyRoof
    assert p and label in p.label,native(p)
    core.action(s,'story_collect')


def arrive(x,y):
    assert s.roofFlight
    for _ in range(100):
        step()
        if not s.roofFlight:
            break
    a=s.actors[s.active]
    assert (a.x,a.y,a.ground)==(x,y,True)


def start_route():
    walk(620)
    gate(roof)
    assert len(s.enemies)==0


def ascend_first_two():
    walk(329)
    jump(395)
    interact('赤い')
    walk(498)
    jump(310)
    walk(584)
    interact('青い')


def finish_course():
    walk(742)
    interact('風車へ')
    arrive(924,145)
    walk(965)
    interact('黄色い')
    walk(1045)
    interact('展望台へ')
    arrive(1322,112)
    walk(1395)
    gate(view)
    walk(563)
    interact('景色')


s=restore(seed)
core.grantExp(s,LEVELS[14]['maple_reference_total_exp_to_reach'],'quest')
assert s.progression.level==15
core.action(s,'story_accept:'+qid)
assert not s.story.quests[qid]
core.grantExp(s,LEVELS[15]['maple_reference_total_exp_to_reach']-s.progression.total,'quest')
assert s.progression.level==16
seed=save()
(ROOT/'work').mkdir(exist_ok=True)
(ROOT/'work/mondstadt-s05-fixture.json').write_text(json.dumps(seed),encoding='utf8')
core.action(s,'story_accept:'+qid)
start_route()
attempt=s.story.quests[qid]
ascend_first_two()
assert attempt.count==2
saved_roof=save()
a=s.actors[s.active]
hp,mora,returns=a.hp,s.mora,s.returns
core.action(s,'drop')
for _ in range(120):
    step()
    if attempt.roof.falls:
        break
assert (a.hp,s.mora,s.returns,a.y,attempt.roof.falls)==(hp,mora,returns,310,1)
walk(742)
interact('風車へ')
core.action(s,'pause')
time0=a.y,s.t,attempt.roof.ticks
step()
assert (a.y,s.t,attempt.roof.ticks)==time0
core.action(s,'pause')
arrive(924,145)
s=restore(saved_roof)
attempt=s.story.quests[qid]
assert s.story.node==town and attempt.count==2 and attempt.roof.ticks==saved_roof['story']['quests'][qid]['roof']['ticks']
walk(965)
gate(view,False)
start_route()
walk(329);jump(395);walk(498);jump(310)
for _ in range(26*60):step()
finish_course()
slow=attempt.roof.bestTicks
assert attempt.count==4 and slow>26*60
assert '通ってきた' in core.frame(s).storyRoof.message
walk(1150)
gate(town)
xp,cash=s.progression.questXp,s.mora
core.action(s,'story_report:'+qid)
core.action(s,'story_report:'+qid)
assert (s.progression.questXp-xp,s.mora-cash,attempt.status)==(2004,210,'complete')
walk(965)
gate(view)
walk(1150)
gate(town)
start_route()
walk(185)
interact('記録')
ascend_first_two()
finish_course()
assert 0<attempt.roof.bestTicks<=26*60<slow and attempt.status=='complete'
assert (s.progression.questXp-xp,s.mora-cash)==(2004,210)

saved=save()
again=restore(saved)
assert again.story.quests[qid].roof.bestTicks==attempt.roof.bestTicks
bad=deepcopy(saved)
bad['story']['quests'][qid]['roof']['bestTicks']=10**9
try:
    validate_save(bad)
except ValueError:
    pass
else:
    raise AssertionError('impossible best time was accepted')
(ROOT/'evidence/mondstadt-s05-lua.json').write_text(json.dumps({
    'm02_and_lv16_gate':True,'noncombat_and_preserved_hp_mora':True,'safety_return':True,
    'pause_freezes_both_time_and_wind_travel':True,'partial_restore':True,
    'slow_first_clear_ticks':slow,'replay_best_ticks':attempt.roof.bestTicks,
    'title_threshold_seconds':26,'single_report':{'xp':2004,'mora':210},
    'persistent_best_time_and_no_replay_payout':True,'two_way_town_shortcut_after_finish':True
},indent=2)+'\n',encoding='utf8')
print('Mondstadt S05 Lua route, safe fall, records, first report and replay passed')
