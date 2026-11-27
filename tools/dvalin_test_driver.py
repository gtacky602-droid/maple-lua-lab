"""Inputs for a manual Dvalin run through the Lua scheduler."""


def drive_dvalin(slot, hero, spec, jump_action, attack_crystal=True):
    card = slot.cast
    platforms = spec['platforms']
    goal = hero.x
    jump = not hero.ground
    attack = False
    aim = None
    move = card.move.id if card else None
    if card:
        tick = card.tick
        dodge = (
            (move == 'WD01' and 52 <= tick < 103)
            or (move == 'WD04' and (99 <= tick < 135 or 145 <= tick < 172))
            or (move == 'WD06' and 150 <= tick < 193)
        )
        if dodge:
            jump = True
            if hero.ground:
                jump_action()

        if move == 'WD08':
            aim = slot.crystalX
            goal = aim - 30
            jump = True
            attack = attack_crystal and 42 <= tick < 462
            if hero.ground and hero.y > spec['stepY'] + 3 and abs(goal - hero.x) < 100:
                jump_action()
        elif move in ('WD02', 'WD03') and card.center:
            goal = card.center + (65 if move == 'WD02' else card.dir * 75)
            aim = card.center + 65
            attack = True
            jump = jump or (move == 'WD02' and 70 <= tick < 103)
            if jump and hero.ground:
                jump_action()
            if move == 'WD03' and 90 <= tick < 234:
                fraction = (tick - 90) / 144
                distance = (card.right - card.left) * fraction
                beam = card.right - distance if card.dir < 0 else card.left + distance
                if abs(beam - hero.x) < 65 and hero.ground:
                    jump_action()
                    jump = True
        elif card.zone:
            safe = platforms[1 if card.zone == 1 else 0]
            goal = safe['x'] + 132
            if move == 'WD07' and card.points:
                platform = platforms[int(card.zone) - 1]
                edges = platform['x'] + 20, platform['x'] + platform['w'] - 20
                goal = max(edges, key=lambda x: min(abs(x - point) for point in card.points.values()))

    hazard = slot.hazard
    if hazard and move != 'WD08':
        platform = platforms[int(hazard.zone) - 1]
        if platform['x'] <= goal <= platform['x'] + platform['w']:
            safe = platforms[1 if hazard.zone == 1 else 0]
            goal = safe['x'] + 132

    offset = goal - hero.x
    direction = 1 if offset > 10 else -1 if offset < -10 else 0
    if direction == 0 and aim is not None and (aim - hero.x) * hero.dir < 0:
        direction = 1 if aim > hero.x else -1
    if direction:
        for platform in platforms:
            left, right = platform['x'], platform['x'] + platform['w']
            edge = right if direction > 0 else left
            if (hero.ground and left <= hero.x <= right and abs(hero.x - edge) < 55
                    and (goal - edge) * direction > 25):
                jump_action()
                jump = True
    return dict(right=direction > 0, left=direction < 0, jump=jump, attack=attack)
