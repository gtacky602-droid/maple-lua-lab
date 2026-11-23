"""Verify shared boss behavior and personal routes through two late branches."""
import json
import subprocess
import sys

from experience import LEVELS, QUEST_REPORT_EXP, RUNTIME_EXP
from runtime import ROOT, native, runtime
from savegame import validate_save
from test_coop_branch_legends import SPECS, actor_at, damage, hit, run_until
from test_coop_local import Client, LOCK, SESSIONS, advance, lab
from test_coop_ruin_guardians import QUESTS, TICK, balances, cross, edge, inspect, lua_cross


CASES = (
    ('original-prism-walker', 'moonlit_garden', 'nod-rim-return',
     ('nod-field', 'nod-special-camp', 'nod-reflector-shore', 'nod-reflection-garden')),
    ('original-ice-crawler', 'ice_expedition', 'novo-return-report',
     ('novo-frozen-works', 'novo-drift-passage')),
)


def guard_sweep(lua, core, state, objective):
    for id in objective['enemies']:
        guard = next(e for e in state.enemies.values() if e.spawnId == id)
        actor_at(state, guard.x, guard.y)
        hit(lua, core, state, guard, power=650, y=guard.y)
        assert guard.hp == 0


def view(core, state):
    return native(core.frame(state).fieldBoss)


def normal_rewards(spec):
    base = LEVELS[spec['level']-1]['normal_enemy_base_exp']
    return (0, int(base*RUNTIME_EXP['roles']['field_boss']+.5), spec['mora'], 0)


def report_rewards(quest):
    return (QUEST_REPORT_EXP.get(quest.get('designId'), quest['xp']), 0, quest['mora'], quest.get('ore', 0))


def difference(after, before):
    return tuple(a-b for a,b in zip(after,before))


def shared_fight(id, q, path, seed):
    lua, core = runtime()
    spec, quest = SPECS[id], QUESTS[q]
    walker = spec['controller'] == 'prismWalker'
    arena = spec['node']
    players = [core.restore(lua.table_from(seed,recursive=True),12) for _ in range(4)]
    for state in players:
        core.action(state,'story_accept:'+q)
        for node in path:
            lua_cross(core,state,edge(state.story.node,node))
        if not walker:
            lua_cross(core,state,edge(path[-1],arena),allowed=False)
            guard_sweep(lua,core,state,quest['itinerary'][0])
        lua_cross(core,state,edge(path[-1],arena))
        state.actors[2].hp = 0

    host,guest,jumper,observer = players
    slot = host.fieldSlots[id]
    boss = slot.enemy
    solo = lambda: core.step(host,TICK,lua.table())
    actor_at(host,boss.x-80)
    run_until(solo,lambda: slot.cast and slot.cast.tick==slot.cast.move.windup-1)
    first = slot.cast
    center = (first.left+first.right)/2
    actor_at(host,center)
    solo()
    assert damage(host)==[(spec['entity'],first.move.damage)]
    actor_at(host,center).inv=0
    room = core.newCoop(host)
    for state in players:
        core.attachCoop(room,state)
    step = lambda: core.stepCoop(room,TICK)
    actor_at(guest,center)
    actor_at(jumper,center,first.top-15)
    safe_x = first.images[2] if walker else first.right+32
    actor_at(observer,safe_x)
    step()
    assert [len(damage(s)) for s in players]==[1,1,0,0]
    initial = view(core,host)
    assert all(view(core,s)==initial for s in players)
    if walker:
        assert initial['images']==[first.images[1],first.images[2]]
        assert len(room.enemies)==1
        hit(lua,core,observer,boss,power=100,x=safe_x)
        assert boss.hp==spec['hp']
    actor_at(host,boss.x)
    hp=boss.hp
    hit(lua,core,host,boss,power=100)
    closed=hp-boss.hp
    run_until(step,lambda: boss.exposed)
    assert all(view(core,s)['exposed'] and 'lane' not in view(core,s) for s in players)
    if walker:
        assert all('images' not in view(core,s) for s in players)
    else:
        assert all(view(core,s)['barrier']==0 and view(core,s)['pose']=='open' for s in players)
    hp=boss.hp
    hit(lua,core,host,boss,power=100)
    opened=hp-boss.hp
    assert (closed,opened)==((95,119) if walker else (9,121)), (closed,opened)

    for state in players:
        actor_at(state,boss.x-132)
    second_id=spec['moves'][1]['id']
    run_until(step,lambda: slot.cast and slot.cast.move.id==second_id)
    second=slot.cast
    lane=view(core,host)['lane']
    center=(lane['left']+lane['right'])/2
    for state in players:
        actor_at(state,lane['right']+45)
    run_until(step,lambda: second.tick==second.move.windup-1)
    assert all(view(core,s)['lane']==lane for s in players)
    actor_at(host,center)
    actor_at(guest,center,380)
    losses=[len(damage(s)) for s in players]
    step()
    assert [len(damage(s))-n for s,n in zip(players,losses)]==[1,1,0,0]
    actor_at(host,center).inv=0
    actor_at(guest,center,380).inv=0
    step()
    assert [len(damage(s))-n for s,n in zip(players,losses)]==[1,1,0,0]
    run_until(step,lambda: boss.exposed)

    before=[balances(s) for s in players]
    count=0 if walker else 1
    actor_at(guest,boss.x)
    hit(lua,core,guest,boss,power=9)
    actor_at(host,boss.x)
    hit(lua,core,host,boss,power=20000)
    assert [s.story.quests[q].count for s in players]==[count+1]*2+[count]*2
    reward=normal_rewards(spec)
    assert [difference(balances(s),old) for s,old in zip(players,before)]==[reward]*2+[(0,0,0,0)]*2
    report=report_rewards(quest)
    for state in players[:2]:
        inspect(core,state,quest['itinerary'][-1])
        lua_cross(core,state,edge(arena,quest['hub']))
        core.detachCoop(state.coopMember)
        prior=balances(state)
        for _ in range(2):
            core.action(state,'story_report:'+q)
        assert difference(balances(state),prior)==report
        saved=validate_save(native(core.checkpoint(state)))
        assert saved['endgame']['bosses'][id]['clears']==1
        restored=core.restore(lua.table_from(saved,recursive=True),12)
        assert restored.story.node==quest['hub'] and restored.story.quests[q].status=='complete'
    return dict(players=4, sharedHP=spec['hp'], moves=[first.move.id,second.move.id],
                imagesAreVisualOnly=walker, lockedSecondAttack=True, oneHitPerActor=True,
                soloHitRetainedOnRoomCreate=True, defendedHit=closed, exposedHit=opened,
                rewards=list(reward), report=list(report))


def http_fight(url,id,q,path,seed):
    spec,quest = SPECS[id],QUESTS[q]
    arena,hub=spec['node'],quest['hub']
    walker=spec['controller']=='prismWalker'
    host,guest=Client(url),Client(url)
    for client in (host,guest):
        client.frame(restore=seed)
    code=host.frame(['coop_create'])['coop']['code']
    assert guest.frame(['coop_join:'+code])['coop']['code']==code
    for client in (host,guest):
        client.frame(['story_accept:'+q])
        node=hub
        for stop in path:
            frame=cross(client,edge(node,stop))
            assert frame['coop']['code']==code and frame['coop']['shared']==walker
            node=stop

    entrance=edge(path[-1],arena)
    if not walker:
        for client in (host,guest):
            with LOCK:
                actor_at(SESSIONS[client.sid]['state'],entrance['x'])
            locked=client.frame(['story_portal:'+arena])
            assert locked['story']['node']==path[-1] and not locked['storyNearbyPortal']['available']
            with LOCK:
                env=SESSIONS[client.sid]
                guard_sweep(env['lua'],env['core'],env['state'],quest['itinerary'][0])
            assert cross(client,entrance)['coop']['shared']
    else:
        for client in (host,guest):
            assert cross(client,entrance)['coop']['shared']
            exit_portal=edge(arena,hub)
            with LOCK:
                actor_at(SESSIONS[client.sid]['state'],exit_portal['x'])
            locked=client.frame(['story_portal:'+hub])
            assert locked['story']['node']==arena and not locked['storyNearbyPortal']['available']
            # Resume neutral positions before the combat starts.
            with LOCK:
                actor_at(SESSIONS[client.sid]['state'],160)

    with LOCK:
        env=SESSIONS[host.sid]
        lua,core,state=env['lua'],env['core'],env['state']
        other=SESSIONS[guest.sid]['state']
        for party in (state,other):
            party.actors[2].hp=0
        world=state.coop
        boss=world.fieldSlot.enemy
        actor_at(state,boss.x-56).atk=105
        state.actors[1].dir=1
    host.frame(['normal'])
    a,b=advance(host,guest,.45)
    hp=a['fieldBoss']['hp']
    assert 0<hp<spec['hp'] and b['fieldBoss']['hp']==hp
    for client in (host,guest):
        cross(client,edge(arena,path[-1]))
    paused=world.tick
    advance(host,guest,.12)
    assert world.tick==paused and boss.hp==hp
    for client in (host,guest):
        assert cross(client,entrance)['coop']['shared']

    with LOCK:
        actor_at(other,boss.x)
        hit(lua,core,other,boss,power=30)
        actor_at(state,boss.x)
        hit(lua,core,state,boss,power=20000)
    for client,party in zip((host,guest),(state,other)):
        assert client.frame(checkpoint=True)['checkpoint']['endgame']['bosses'][id]['clears']==1
        final=quest['itinerary'][-1]
        with LOCK:
            actor_at(party,final['x'],final['y'])
        progress=client.frame(['story_collect'])
        assert progress['story']['quests'][q]['count']==quest['goal']
        cross(client,edge(arena,hub))
        before=balances(party)
        reported=client.frame(['story_report:'+q],checkpoint=True)
        assert difference(balances(party),before)==report_rewards(quest)
        assert client.frame(['story_report:'+q])['mora']==reported['mora']
        restored=client.frame(restore=reported['checkpoint'])
        assert restored['story']['quests'][q]['status']=='complete'
    return dict(players=2, questGateChecked=True, privateGuardSweeps=not walker,
                sharedCombatPersistsDuringRetreat=True, directReturn=True, bothReportedOnce=True,
                bothRestored=True)


if __name__=='__main__':
    result={}
    for id,test,q,path in CASES:
        subprocess.run([sys.executable,'-X','utf8',str(ROOT/f'test_{test}.py')],check=True)
        seed=json.loads((ROOT/f'work/coop-{id}-fixture.json').read_bytes())
        result[id]={'lua':shared_fight(id,q,path,seed)}
        with lab() as url:
            result[id]['http']=http_fight(url,id,q,path,seed)
    (ROOT/'evidence/coop-late-branch-bosses-lua-http.json').write_text(
        json.dumps(result,indent=2)+'\n',encoding='utf8')
    print(result)
