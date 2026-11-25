"""Play the ordinary hunt contracts with the earned level-200 party and standard inputs."""
from collections import defaultdict
import json
from test_earned_branch_quests import Journey, ROOT, quests

CHASE = """
function(C,s,e)
 local climbX,climbY
 for i=1,1800 do
  if e.hp<=0 then return i end
  local a=s.actors[s.active]
  local dx,dy=e.x-a.x,e.y-a.y
  if a.ground then
   climbX,climbY=nil,nil
   if dy < -150 then
    local best
    for _,p in ipairs(s.platforms) do
     if p.y<a.y-10 and p.y>=a.y-145 then
      local x=math.max(p.x+12,math.min(p.x+p.w-12,e.x))
      local cost=math.abs(a.x-x)+math.abs(e.x-x)
      if not best or cost<best then climbX,climbY,best=x,p.y,cost end
     end
    end
   end
  end
  if climbX then dx,dy=climbX-a.x,climbY-a.y end
  local edge=false
  for _,p in ipairs(s.platforms) do
   if p.y==a.y and a.x>=p.x and a.x<=p.x+p.w then
    edge=(dx>0 and p.x+p.w-a.x<22) or (dx<0 and a.x-p.x<22)
    if edge then break end
   end
  end
  if a.ground and dy < -38 and (math.abs(dx)<105 or edge) then C.action(s,'jump') end
  local move=math.abs(dx)>40 or dx*a.dir<0
  if dy>48 and a.ground then C.action(s,'drop') end
  C.step(s,1/60,{left=move and dx<0,right=move and dx>0,jump=dy < -38 or a.vy<0,attack=math.abs(e.x-a.x)<110})
 end
 return 0
end
"""

def play():
    trip = Journey('lv200-save.json')
    chase = trip.lua.eval(CHASE)
    fields = defaultdict(list)
    for q in quests.values():
        if q['kind']=='kill' and not q.get('legacyOnly') and not q.get('designId'):
            fields[q['hub'], q['target']].append(q)
    records, waiting, saved = [], {}, {}
    for (hub, field), batch in fields.items():
        if trip.state.story.visited[hub]:
            trip.warp(hub)
        else:
            trip.travel(hub)
        for cycle in (1, 2):
            group = [q for q in batch if cycle == 1 or q.get('repeatable')]
            if not group:
                continue
            for q in group:
                trip.act('story_accept:'+q['id'])
                state = trip.state.story.quests[q['id']]
                assert state and state.status=='active' and state.count==0, (q['id'], trip.state.storyNotice)
            if field=='mond-road' and cycle==1:
                (ROOT/'work/earned-mond-hunts.json').write_text(json.dumps(trip.snapshot()), encoding='utf8')
                trip.travel('mond-border')
                assert not trip.frame().storyHunts
                before = [trip.state.story.quests[q['id']].count for q in group]
                enemy = next(e for e in trip.state.enemies.values() if e.spawnId and e.hp>0 and not e.boss)
                assert chase(trip.core,trip.state,enemy)
                assert [trip.state.story.quests[q['id']].count for q in group]==before
            trip.travel(field)
            ids = set()
            for _ in range(500):
                active = [q for q in group if trip.state.story.quests[q['id']].count<q['goal']]
                if not active:
                    break
                q = active[0]
                hints = trip.frame().storyHunts
                assert hints and all(hints[a['id']] for a in active), (field, q['id'])
                target = hints[q['id']]
                if target.wait is not None:
                    assert 0<=target.wait<=120
                    waiting.setdefault(field,target.wait)
                    trip.tick(max(1,target.wait*60+1))
                    continue
                enemies = [e for e in trip.state.enemies.values() if e.hp>0 and e.spawnId and not e.boss and not e.noRewards]
                enemy = next(e for e in enemies if e.spawnId==target.spawn)
                distance = lambda e:(e.x-trip.actor.x)**2+(e.y-trip.actor.y)**2
                if not q.get('enemy'):
                    assert distance(enemy)==min(map(distance,enemies))
                ids.add(enemy.spawnId)
                count = trip.state.story.quests[q['id']].count
                assert chase(trip.core,trip.state,enemy), (field,target.spawn,trip.actor.x,trip.actor.y,enemy.x,enemy.y)
                assert trip.state.story.quests[q['id']].count>count, (field,q['id'],target.spawn)
                midway = [a for a in active if a['id'] not in saved and
                          0<trip.state.story.quests[a['id']].count<a['goal']]
                if midway:
                    for a in midway:
                        saved[a['id']]=trip.state.story.quests[a['id']].count
                        before = trip.state.mora,trip.state.progression.questXp
                        trip.act('story_report:'+a['id'])
                        assert (trip.state.mora,trip.state.progression.questXp)==before
                    trip.restore()
                    for a in midway:
                        assert trip.state.story.quests[a['id']].count==saved[a['id']]
                    trip.travel(field)
            else:
                raise AssertionError(('contract did not finish',field,cycle))
            hints = trip.frame().storyHunts
            assert not hints or not any(hints[q['id']] for q in group)
            trip.travel(hub)
            for q in group:
                trip.report(q['id'])
                assert trip.state.story.quests[q['id']].cycles==cycle
            trip.restore()
            assert all(trip.state.story.quests[q['id']].cycles==cycle for q in group)
            records.append(dict(field=field,cycle=cycle,quests=[q['id'] for q in group],guidedSpawns=sorted(ids)))
            print(field, cycle, flush=True)
    assert len(saved)==12 and waiting and trip.state.returns==0
    data = dict(sourceSha256=trip.source, contracts=records, reports=trip.reports, savedCounts=saved,
                observedRespawnSeconds=waiting, wrongField='mond-border', routeLegs=sum(len(i['stops']) for i in trip.itineraries),
                returns=trip.state.returns)
    (ROOT/'evidence/earned-hunt-contracts.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n', encoding='utf8')

if __name__=='__main__':
    play()
