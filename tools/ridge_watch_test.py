"""Exercise the established flower-and-feather route with ordinary Lua input."""


def earn_ridge_watch_pair(lua, core, trail, rank):
    state = trail.state
    core.action(state, 'story_fast:mond-town')
    assert state.story.node == 'mond-town'
    for node in ('mond-road', 'mond-border', 'sites-lookout-10009', 'ridge-watch-domain'):
        trail.cross(node)
    assert core.frame(state).artifactDomain.status == 'ready'
    play = lua.eval("""
        function(C,s)
            for tick=1,21600 do
                local run=s.artifactDomainRun
                if not run or run.status~='fighting' then return end
                local actor=s.actors[1]
                local target,nearest=nil,math.huge
                for _,enemy in ipairs(s.enemies) do
                    local distance=math.abs(enemy.x-actor.x)
                    if enemy.hp>0 and distance<nearest then
                        target,nearest=enemy,distance
                    end
                end
                local dx=target and target.x-actor.x or 0
                local left=dx< -35 or dx<0 and actor.dir>0
                local right=dx>35 or dx>0 and actor.dir<0
                C.step(s,1/60,{attack=true,left=left,right=right})
            end
        end
        """)
    items = state.inventory['items']
    rewards = []
    for slot in (1, 2):
        core.action(state, f'artifact_domain_start:{rank}:paleFlame')
        play(core, state)
        attempt = state.artifactDomainRun
        assert attempt and attempt.status == 'clear' and state.returns == 0
        item = items[len(items)]
        assert item.slot == slot and item.setId == 'paleFlame'
        rewards.append(dict(id=item.id, slot=slot, seconds=round(state.t-attempt.started, 2)))
    core.action(state, 'story_fast:mond-town')
    assert state.story.node == 'mond-town'
    for row in rewards:
        core.action(state, f"artifact_equip:{row['id']}")
    return rewards
