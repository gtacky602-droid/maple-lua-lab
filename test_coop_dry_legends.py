"""Exercise five Fontaine encounters and the personal underwater quest gate."""
import json
from time import monotonic, sleep

from runtime import ROOT, runtime
from test_coop_branch_legends import (
    NODES, SPECS, actor_at, browser_fixtures, damage, hit, level, read, via_http, view,
)
from test_coop_childe import run
from test_coop_lake_legends import finish, open_cast
from test_coop_local import Client, LOCK, SESSIONS, advance, lab


LEGENDS=read('sources/map-research/sites-fontaine-dry-legends.json')['legends']
UNDERWATER=next(row for row in LEGENDS if row.get('prerequisite'))
QUEST=UNDERWATER['prerequisite']
APPROACH,CAVE=UNDERWATER['approach']
ARENA=UNDERWATER['stage']
TEST_MOVES=((2,'FD12'),(2,'FD22'),(1,'FD31'),(1,'FD41'),(2,'FD52'))


def shared_strikes(lua,core,id,index,move):
    spec,parties,_,slot,step=open_cast(core,id,index,44)
    cast=slot.cast
    assert cast.move.id==move
    assert len(view(core,parties[0])['warnings'])==2
    start_x=slot.enemy.x
    expected=[[],[],[],[]]
    for i,strike in enumerate(cast.strikes.values()):
        run(step,strike.step.first-cast.tick-1)
        for j,s in enumerate(parties): actor_at(s,1400+j*22)
        center=(strike.left+strike.right)/2 if not strike.step.travel else strike.position
        actor_at(parties[i],center)
        actor_at(parties[2],center,spec['floorY']-strike.step.height-18)
        step()
        warnings=view(core,parties[0])['warnings']
        active=next(w for w in warnings if w['number']==i+1)
        assert active['active'] and all(view(core,s)['warnings']==warnings for s in parties)
        assert active['left']<=active['activeLeft']<active['activeRight']<=active['right']
        expected[i]=[(spec['entity'],strike.step.damage)]
        actual=[damage(s) for s in parties]
        assert actual==expected, (move,i+1,actual,expected)
        actor_at(parties[2],1444)
        if strike.step.travel:
            assert active['activeRight']-active['activeLeft']<active['right']-active['left']
            assert slot.enemy.x!=start_x
    return dict(move=move, xp=finish(lua,core,spec,parties,slot),mora=spec['mora'])


def at(client,x,y):
    with LOCK:
        actor_at(SESSIONS[client.sid]['state'],x,y)


def edge(from_node,to):
    return next(e for e in NODES[from_node]['exits'] if e['to']==to)


def dive(client,from_node,to):
    gate=edge(from_node,to)
    y=gate.get('y',480)
    at(client,gate['x'],y)
    initial=client.frame(['story_portal:'+to])
    assert initial['story']['node']==from_node and initial['storyLift']['waterway']
    until=monotonic()+gate['waterwaySeconds']+4
    while monotonic()<until:
        sleep(.04)
        frame=client.frame()
        if frame['story']['node']==to:
            assert abs(frame['actors'][0]['y']-gate['arrivalY'])<=1
            assert frame['coop']['map']==to
            return frame
    raise AssertionError(f'Underwater route stalled: {from_node} → {to}')


def underwater(url):
    host,guest=Client(url),Client(url)
    for client in (host,guest):
        client.frame(['story_start'])
        with LOCK:
            env=SESSIONS[client.sid]
            core,s=env['core'],env['state']
            level(core,s,100 if client is host else 99)
            core.enterStoryNode(s,'fontaine-hub')
            core.action(s,'story_accept:'+QUEST)
            assert s.story.quests[QUEST].status=='active'
            if client is host:
                s.story.quests[QUEST].count=3
                core.action(s,'story_report:'+QUEST)
            core.enterStoryNode(s,APPROACH)
            s.actors[2].hp=0
    code=host.frame(['coop_create'])['coop']['code']
    assert guest.frame(['coop_join:'+code])['coop']['code']==code
    assert dive(host,APPROACH,CAVE)['storySwim']
    cave=dive(guest,APPROACH,CAVE)
    assert cave['storySwim'] and cave['coop']['peers'][0]['map']==CAVE
    field=dive(host,CAVE,ARENA)
    assert not field.get('storySwim') and field['coop']['enemies'][0]['hp']==SPECS[UNDERWATER['id']]['hp']
    at(guest,1000,278)
    below_level=guest.frame(['story_portal:'+ARENA])
    assert below_level['story']['node']==CAVE and '100' in below_level['storyNearbyPortal']['reason']
    with LOCK:
        env=SESSIONS[guest.sid]
        level(env['core'],env['state'],100)
    at(guest,1000,278)
    denied=guest.frame(['story_portal:'+ARENA])
    assert denied['story']['node']==CAVE and '報告' in denied['storyNearbyPortal']['reason']
    assert not denied.get('storyLift') and denied['coop']['code']==code
    at(guest,851,278)
    inspected=guest.frame(['story_collect'])
    assert inspected['story']['quests'][QUEST]['count']==2
    assert dive(guest,CAVE,APPROACH)['story']['quests'][QUEST]['count']==3
    assert guest.frame(['story_fast:fontaine-hub'])['story']['node']=='fontaine-hub'
    assert guest.frame(['story_report:'+QUEST])['story']['quests'][QUEST]['status']=='complete'
    assert guest.frame(['story_fast:'+APPROACH])['coop']['code']==code
    dive(guest,APPROACH,CAVE)
    assert dive(guest,CAVE,ARENA)['coop']['peers'][0]['map']==ARENA
    with LOCK:
        env=SESSIONS[host.sid]
        core,lua=env['core'],env['lua']
        states=[SESSIONS[c.sid]['state'] for c in (host,guest)]
        room=env['coop_room'].worlds[ARENA]
        b=room.fieldSlot.enemy
        for s in states:
            a=actor_at(s,b.x-65)
            a.dir,a.atk=1,42
    for c in (host,guest): c.frame(['normal'])
    a,g=advance(host,guest,.12)
    assert 0<a['fieldBoss']['hp']==g['fieldBoss']['hp']<b.maxhp
    for c in (host,guest):
        assert dive(c,ARENA,CAVE)['storySwim']
    frozen=room.tick,b.hp
    advance(host,guest,.16)
    assert (room.tick,b.hp)==frozen
    for c in (host,guest):
        assert dive(c,CAVE,ARENA)['coop']['enemies'][0]['hp']==frozen[1]
    with LOCK:
        for s in states: actor_at(s,b.x)
        hit(lua,core,states[1],b,20)
        hit(lua,core,states[0],b,5000)
    for c in (host,guest):
        frame=c.frame(checkpoint=True)
        assert frame['fieldBoss']['phase']=='cleared'
        assert frame['checkpoint']['endgame']['bosses'][UNDERWATER['id']]['clears']==1


if __name__=='__main__':
    lua,core=runtime()
    results={row['stage']:shared_strikes(lua,core,row['id'],*move)
             for row,move in zip(LEGENDS,TEST_MOVES,strict=True)}
    browser_fixtures(lua,core,tuple(row['id'] for row in LEGENDS))
    browser_fixtures(lua,core,(UNDERWATER['id'],),'before-report-fixture')
    with lab() as url:
        for row in LEGENDS:
            if row is not UNDERWATER: via_http(url,row['id'],check_level=True)
        underwater(url)
    proof=dict(lua=dict(participants=4,encounters=results,orderedSharedZones=True,
                        separateHitsAndHeightAvoidance=True,onlyContributorsCredited=True),
               http=dict(participants=2,groundEncounters=4,individualLevel100=True,
                         sharedUnderwaterRoute=True,personalQuestGate=True,
                         underwaterInspectAndReport=True,sharedHpAfterRetreat=True,individualLedger=True))
    (ROOT/'evidence/coop-dry-legends-lua-http.json').write_text(json.dumps(proof,indent=2)+'\n',encoding='utf8')
    print(proof)
