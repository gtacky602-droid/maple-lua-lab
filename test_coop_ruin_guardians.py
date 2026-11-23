"""Verify both original archive fights over Lua and local HTTP rooms."""
import json
import subprocess
import sys

from runtime import ROOT, native, runtime
from savegame import validate_save
from test_coop_branch_legends import NODES, SPECS, actor_at, damage, hit, run_until
from test_coop_local import Client, LOCK, SESSIONS, advance, lab
from test_coop_travel import cross


CASES = (
    ('original-wind-ring', 'tunigi-excavation', ('tunigi-return-shelter','tunigi-elite-passage'), ('WR01','WR02')),
    ('original-bellgate', 'bygone-resonance', ('bygone-listening-gallery',), ('BG01','BG02')),
)
QUESTS = {q['id']:q for q in json.loads((ROOT/'content/story-graph.json').read_bytes())['quests']}
TICK = 1/60


def edge(node, target):
    return next(e for e in NODES[node]['exits'] if e['to']==target)


def lua_cross(core,state,portal,allowed=True):
    node=state.story.node
    actor_at(state,portal['x'],portal.get('y',480))
    seen=core.frame(state).storyNearbyPortal
    assert seen.to==portal['to'] and seen.available==allowed
    core.action(state,'story_portal:'+portal['to'])
    assert state.story.node==(portal['to'] if allowed else node)
    return seen


def balances(state):
    return (state.progression.questXp,state.progression.killXp,state.mora,state.inventory.upgradeOre)


def inspect(core,state,objective):
    actor_at(state,objective['x'],objective['y'])
    core.action(state,'story_collect')


def shared_fight(spec,path,moves,seed):
    lua,core=runtime()
    arena=spec['node']
    window=spec['storyWindow']
    quest=QUESTS[window['quest']]
    q=quest['id']
    camp=quest['hub']
    players=[core.restore(lua.table_from(seed,recursive=True),12) for _ in range(4)]
    host,guest,watcher,evader=players
    for state in players:
        core.action(state,'story_accept:'+q)
        for target in path:
            lua_cross(core,state,edge(state.story.node,target))
        gate=edge(path[-1],arena)
        if window['first']:
            lua_cross(core,state,gate,False)
            for enemy in list(state.enemies.values()):
                core.defeatEnemy(state,enemy,1)
        lua_cross(core,state,gate)
        state.actors[2].hp=0
        actor_at(state,spec['home']-135)

    slot=host.fieldSlots[spec['id']]
    solo=lambda:core.step(host,TICK,lua.table())
    run_until(solo,lambda:slot.cast and slot.cast.tick==slot.cast.move.windup-1)
    cast=slot.cast
    first=cast.zones[1]
    center=(first.left+first.right)/2
    actor_at(host,center)
    solo()
    assert damage(host)==[(spec['entity'],cast.move.damage)]
    host.actors[1].inv=0
    room=core.newCoop(host)
    for state in players:
        core.attachCoop(room,state)
    step=lambda:core.stepCoop(room,TICK)
    actor_at(guest,center)
    actor_at(evader,center,first.top-25)
    actor_at(watcher,spec['home'])
    step()
    assert [len(damage(s)) for s in players]==[1,1,0,0]
    assert all(core.frame(s).fieldBoss.hp==spec['hp'] for s in players)
    assert all(native(core.frame(s).fieldBoss.zones)==native(core.frame(host).fieldBoss.zones) for s in players)
    if len(cast.zones)>1:
        second=cast.zones[2]
        run_until(step,lambda:cast.tick==second.first-1)
        assert not damage(watcher)
        actor_at(watcher,(second.left+second.right)/2).inv=0
        step()
        assert damage(watcher)==[(spec['entity'],cast.move.damage)]
        assert second.first-first.first==42
    run_until(step,lambda:slot.enemy.recovering)
    assert all(core.frame(s).fieldBoss.recovering for s in players)

    for state in players:
        actor_at(state,slot.enemy.x-80)
    run_until(step,lambda:slot.cast and slot.cast.move.id==moves[1])
    target=slot.cast.zones[1]
    locked=(target.left,target.right)
    run_until(step,lambda:slot.cast.tick==target.first-1)
    actor_at(host,target.right+35)
    actor_at(guest,(target.left+target.right)/2).inv=0
    actor_at(watcher,target.left-50)
    actor_at(evader,target.right+60)
    before=[len(damage(s)) for s in players]
    step()
    assert [len(damage(s))-n for s,n in zip(players,before)]==[0,1,0,0]
    assert (target.left,target.right)==locked
    run_until(step,lambda:slot.enemy.recovering)

    before=[balances(s) for s in players]
    for state in players:
        actor_at(state,slot.enemy.x)
    hit(lua,core,guest,slot.enemy,power=8)
    hit(lua,core,host,slot.enemy,power=1000)
    assert [s.story.quests[q].count for s in players]==[window['after']]*2+[window['first']]*2
    assert [balances(s) for s in players]==before

    record,report=quest['itinerary'][-2:]
    rewards=(quest['xp'],0,quest['mora'],quest['ore'])
    for state in (host,guest):
        if window['first']:
            gate=lua_cross(core,state,edge(arena,path[-1]),False)
            assert '崩れた壁' in gate.reason
        inspect(core,state,record)
        # Bell Gate has two exits to the gallery. Follow the right-hand return route.
        lua_cross(core,state,NODES[arena]['exits'][-1])
        lua_cross(core,state,edge(state.story.node,camp))
        inspect(core,state,report)
        before_report=balances(state)
        for _ in range(2):
            core.action(state,'story_report:'+q)
        assert tuple(a-b for a,b in zip(balances(state),before_report))==rewards
        data=validate_save(native(core.checkpoint(state)))
        assert data['endgame']['bosses'][spec['id']]['clears']==1
        assert core.restore(lua.table_from(data,recursive=True),12).story.quests[q].status=='complete'
    return dict(players=4,hp=spec['hp'],moves=list(moves),noDoubleHitOnRoomCreation=True,
                staggeredZones=len(cast.zones),lockedTarget=list(locked), sharedRecovery=True,
                twoContributorsOnly=True,noFightPayout=True,reportReward=list(rewards))


def http_fight(url,spec,path,seed):
    arena=spec['node']
    window=spec['storyWindow']
    q=window['quest']
    host,guest=Client(url),Client(url)
    for client in (host,guest):
        client.frame(restore=seed)
    code=host.frame(['coop_create'])['coop']['code']
    assert guest.frame(['coop_join:'+code])['coop']['code']==code
    for client in (host,guest):
        camp=QUESTS[q]['hub']
        if client is guest and not window['first']:
            cross(client,edge(camp,path[0])['x'],path[0])
            with LOCK:
                actor_at(SESSIONS[client.sid]['state'],edge(path[0],arena)['x'])
            blocked=client.frame(['story_portal:'+arena])
            assert blocked['story']['node']==path[0] and not blocked['storyNearbyPortal']['available']
            cross(client,edge(path[0],camp)['x'],camp)
        frame=client.frame(['story_accept:'+q])
        assert frame['story']['quests'][q]['status']=='active'
        node=frame['story']['node']
        for target in path:
            cross(client,edge(node,target)['x'],target)
            node=target
        with LOCK:
            env=SESSIONS[client.sid]
            actor_at(env['state'],edge(path[-1],arena)['x'])
        if window['first']:
            frame=client.frame(['story_portal:'+arena])
            assert frame['story']['node']==path[-1] and not frame['storyNearbyPortal']['available']
            with LOCK:
                for enemy in list(env['state'].enemies.values()):
                    env['core'].defeatEnemy(env['state'],enemy,1)
        frame=cross(client,edge(path[-1],arena)['x'],arena)
        assert frame['coop']['shared']
        with LOCK:
            env['state'].actors[2].hp=0
    with LOCK:
        env=SESSIONS[host.sid]
        lua,core,state=env['lua'],env['core'],env['state']
        room=state.coop
        body=room.fieldSlot.enemy
        actor_at(state,body.x-62).atk=55
        state.actors[1].dir=1
    host.frame(['normal'])
    a,b=advance(host,guest,.38)
    hp=a['fieldBoss']['hp']
    assert 0<hp<spec['hp'] and b['fieldBoss']['hp']==hp
    for client in (host,guest):
        cross(client,edge(arena,path[-1])['x'],path[-1])
    paused=room.tick
    advance(host,guest,.12)
    assert room.tick==paused and room.fieldSlot.enemy.hp==hp
    for client in (host,guest):
        f=cross(client,edge(path[-1],arena)['x'],arena)
        assert any(enemy['id']==spec['entity'] and enemy['hp']==hp for enemy in f['coop']['enemies'])
    with LOCK:
        actor_at(state,body.x)
        hit(lua,core,state,body,power=1000)
    a,b=advance(host,guest,.08)
    assert not a['coop']['shared'] and b['coop']['shared']
    assert a['story']['quests'][q]['count']==window['after']
    assert b['story']['quests'][q]['count']==window['first']
    if window['first']:
        with LOCK:
            actor_at(state,edge(arena,path[-1])['x'])
        assert '崩れた壁' in host.frame()['storyNearbyPortal']['reason']
        cross(guest,edge(arena,path[-1])['x'],path[-1])
    return dict(personalGate=True,ordinaryAttackSharesHP=True,retreatKeepsHP=True,onlyContributorAdvances=True,
                collapseDependsOnPersonalQuest=bool(window['first']))


if __name__=='__main__':
    result={}
    for id,name,path,moves in CASES:
        subprocess.run([sys.executable,'-X','utf8',str(ROOT/f'test_{name.replace("-","_")}.py')],check=True)
        seed=json.loads((ROOT/f'work/coop-{id}-fixture.json').read_text(encoding='utf8'))
        result[id]=dict(lua=shared_fight(SPECS[id],path,moves,seed))
        with lab() as url:
            result[id]['http']=http_fight(url,SPECS[id],path,seed)
    (ROOT/'evidence/coop-ruin-guardians-lua-http.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
    print(result)
