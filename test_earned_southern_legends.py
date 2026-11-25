"""Walk the four overworld legend routes, their survey quests and both entrances of the pair."""
import json

from test_earned_branch_quests import Journey, ROOT, graph

hub = 'natlan-hub'
signs = 'natlan-seaward-signs'
survey = 'natlan-southern-trail-survey'
fork, trail, clearing = 'night-wind-seaward-fork', 'atocpan-peak-rock-trail', 'atocpan-domain-side-clearing'
rilai, peak = 'night-wind-rilai-clearing', 'atocpan-peak-cave'
pair, bay = 'atocpan-battlegoat-ironclaw-field', 'zapabay-tenochtzitoc-shallows'
nodes = {n['id']:n for n in graph['nodes']}
roster = {r['node']:r for r in json.loads((ROOT/'content/field-boss-spawns.json').read_bytes())['fieldBosses']}
trip = Journey('lv165-save.json')
assert trip.state.progression.level == 165
trip.warp(hub)
for quest in (signs,survey):
    assert trip.state.story.quests[quest] is None
    trip.act('story_accept:'+quest)
clears = {}

def enter(node):
    legs = trip.travel(node)
    last = legs[-1]
    gate = next(e for e in nodes[last['from']]['exits'] if e['to']==node and e.get('x')==last['previewX']
                and e.get('y',480)==last.get('previewY',480))
    assert gate['to'] == node and not last.get('automaticArrival')
    return gate

def finish_record(node,prior):
    boss = roster[node]['id']
    assert trip.state.fieldSlots[boss].phase == 'cleared' and trip.state.endgame.bosses[boss].clears == prior+1
    clears[boss] = prior+1
    trip.travel(nodes[node]['exits'][0]['to'])

def prior_clears(node):
    record = trip.state.endgame.bosses[roster[node]['id']]
    return record.clears if record else 0

def clear_single(node):
    enter(node)
    assert not trip.state.storySwimming
    slot = trip.state.fieldSlots[roster[node]['id']]
    prior = prior_clears(node)
    trip.fight([slot.enemy],trip.totals())
    finish_record(node,prior)

def climb(node):
    shelves=sorted(nodes[node]['platforms'],key=lambda p:-p['y'])
    for lower,upper in zip(shelves,shelves[1:]):
        left=max(lower['x'],upper['x'])
        right=min(lower['x']+lower['w'],upper['x']+upper['w'])
        assert left < right
        trip.approach((left+right)//2,upper['y'],node)

trip.travel(fork)
trip.mark(signs,1)
clear_single(rilai)
climb(fork)
trip.mark(signs,2)
trip.warp(hub)
trip.report(signs)
trip.travel(trail)
climb(trail)
trip.mark(survey,1)
clear_single(peak)
assert trip.actor.y == 346
trip.warp(hub)
trip.travel('sites-hunt-82577')
trip.travel(clearing)
trip.mark(survey,2)
enter(pair)
group = trip.state.fieldSlots[roster[pair]['id']].enemy
members = list(group.fieldMembers.values())
assert [m.memberName for m in members] == ['戦羊','鉄爪']
prior = prior_clears(pair)
before = trip.totals()
partial = []
fallen = set()
for _ in range(3600):
    alive = [body for body in members if body.hp > 0]
    if not alive:
        break
    body = min(alive,key=lambda b:abs(b.x-trip.actor.x))
    delta = body.x-trip.actor.x
    turn = delta*trip.actor.dir<0
    move = abs(delta)>60 or turn
    trip.tick(1,trip.lua.table(left=move and delta<0,right=move and delta>0,attack=abs(delta)<90))
    for member in members:
        if member.hp<=0 and member.id not in fallen:
            fallen.add(member.id)
            partial.append(dict(defeated=member.memberName,groupHP=group.hp,killDelta=trip.state.kills-before[0],
                                xpDelta=trip.state.progression.killXp-before[1],clears=prior_clears(pair)-prior))
assert len(partial)==2
assert partial[0]['groupHP']>0 and (partial[0]['killDelta'],partial[0]['xpDelta'],partial[0]['clears'])==(0,0,0),partial
assert partial[1]['groupHP']==0 and partial[1]['killDelta']==partial[1]['clears']==1 and partial[1]['xpDelta']>0
finish_record(pair,prior)
trip.travel('nat-wp-82564')
trip.travel(clearing)
trip.warp(hub)
trip.report(survey)
clear_single(bay)
assert trip.actor.y == 419
trip.warp(hub)
trip.restore()
assert all(trip.state.endgame.bosses[id].clears==count for id,count in clears.items())
assert all(trip.state.story.quests[q].status=='complete' for q in (signs,survey))
proof = trip.proof() | dict(levelAtStart=165,draftBalance=True,clearsAfterReload=clears,groupRewards=partial)
(ROOT/'evidence/earned-southern-legends.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2)+'\n','utf8')
print(f"{sum(len(t['stops']) for t in trip.itineraries)} legs, two surveys, both group members and four saved clears.")
