from runtime import native


def exercise_ruin_guardian(lua, core, state, boss_id):
    """Check both casts on the story party, then leave the boss open for its quest clear."""
    slot = state.fieldSlots[boss_id]
    boss = slot.enemy
    actor = state.actors[state.active]
    idle = lua.table()
    held_jump = lua.table_from({'jump':True})
    state.actors[2].hp = 0

    def place(x):
        actor.x, actor.y, actor.vy, actor.ground = x, boss.y, 0, True

    def until(predicate, controls=idle):
        for _ in range(720):
            if predicate():
                return
            core.step(state, 1/60, controls)
        raise AssertionError((boss_id, 'attack did not advance'))

    place(boss.x-118)
    until(lambda: slot.cast is not None)
    first = slot.cast
    zone = first.zones[1]
    shown = core.frame(state).fieldBoss.zones
    assert shown[1].first == zone.first and shown[1].active is False
    if len(shown)==2:
        assert shown[2].first-shown[1].first==first.move.interval
        assert shown[1].right < boss.x < shown[2].left
    place((zone.left+zone.right)/2)
    until(lambda: first.tick==zone.first-12)
    hp = actor.hp
    core.action(state,'jump')
    until(lambda: first.tick==zone.first,held_jump)
    assert actor.y < zone.top and actor.hp==hp
    assert core.frame(state).fieldBoss.zones[1].active
    until(lambda: first.tick>=zone.first+first.move.active,held_jump)
    assert actor.hp==hp
    place(boss.x+12)
    until(lambda: boss.recovering)
    assert actor.hp==hp

    place(boss.x-75)
    until(lambda: slot.cast is not None and slot.cast.move.id!=first.move.id)
    second = slot.cast
    zone = second.zones[1]
    bounds = zone.left, zone.right
    assert bounds[0]<actor.x<bounds[1]
    if second.destination is not None:
        place((second.origin+second.destination)/2)
        until(lambda: second.tick==zone.first)
        assert boss.x!=second.origin and actor.hp==hp
        until(lambda: actor.hp<hp)
        assert (zone.left,zone.right)==bounds
    else:
        place(zone.right+48)
        until(lambda: second.tick==zone.first)
        assert (zone.left,zone.right)==bounds and actor.hp==hp
        place((zone.left+zone.right)/2)
        core.step(state,1/60,idle)
    assert actor.hp==hp-second.move.damage
    until(lambda: boss.recovering)
    assert actor.hp==hp-second.move.damage
    if second.destination is not None:
        assert boss.x==second.destination
    test_cast = lua.table_from({'id':state.active,'atk':40,'mult':1,'gain':0,'element':'physical'})
    recover_damage = core.damageFactor(state,test_cast,boss,'physical')
    assert recover_damage==1.35
    proof = dict(moves=[first.move.id,second.move.id], warningAt=shown[1].first, jumpAvoidance=True)
    if second.destination is not None:
        proof.update(warningStaysFixed=True, bodyTravel=abs(second.destination-second.origin))
    else:
        proof['targetedAreaStaysFixed']=True
    return dict(proof,singleHit=second.move.damage,recoveryFactor=recover_damage,warningZones=native(shown))
