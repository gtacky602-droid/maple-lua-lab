"""Drive story gates using the same movement, jump and portal actions as the browser."""

class TrailWalk:
    def __init__(self, lua, core, state, edges, exits):
        self.core, self.state, self.edges, self.exits = core, state, edges, exits
        self.inputs = {d: lua.table_from({d: True}) for d in ('left', 'right', 'jump', 'up', 'down')}
        self.idle = lua.table()
        self.crossings = set()

    @property
    def actor(self):
        return self.state.actors[self.state.active]

    def approach(self, x, y, target):
        origin = self.state.story.node
        for _ in range(1200):
            actor = self.actor
            assert actor.hp > 0 and self.state.story.node == origin, (origin, target, actor.hp)
            if abs(actor.x - x) > 9:
                movement = self.inputs['left' if actor.x > x else 'right']
                self.core.step(self.state, 1 / 60, movement)
                continue
            if self.state.storySwimming:
                if abs(actor.y - y) < 9:
                    return
                movement = self.inputs['up' if actor.y > y else 'down']
                self.core.step(self.state, 1 / 60, movement)
                continue
            if abs(actor.y - y) < 10 and actor.ground:
                return
            if actor.ground:
                self.core.action(self.state, 'jump' if actor.y > y else 'drop')
            movement = self.inputs['jump'] if actor.y > y else self.idle
            self.core.step(self.state, 1 / 60, movement)
        raise AssertionError((origin, target, x, y, actor.x, actor.y, actor.ground))

    def cross(self, target, gate_x=None):
        origin = self.state.story.node
        edge = self.edges[origin, target]
        if gate_x is not None:
            edge = next(e for e in self.exits[origin] if e['to'] == target and e['x'] == gate_x)
        self.approach(edge['x'], edge.get('y', 480), target)
        if 'windowStart' in edge:
            voyage = self.state.voyage
            assert voyage is not None
            start = voyage.started + edge['windowStart']
            end = voyage.started + edge['windowEnd']
            for _ in range(round(60 * (edge['windowStart'] + 1))):
                if self.state.t + 1e-8 >= start:
                    break
                self.core.step(self.state, 1 / 60, self.idle)
            assert start <= self.state.t + 1e-8 < end
        if edge.get('wind'):
            for _ in range(round(15 * (edge['wind']['period'] + 1))):
                portal = self.core.frame(self.state, 'sprite', 'legacy').storyNearbyPortal
                assert portal and portal.to == target
                if portal.available:
                    break
                for _ in range(4):
                    self.core.step(self.state, 1 / 60, self.idle)
            else:
                raise AssertionError((origin, target, 'wind did not subside'))
        self.core.action(self.state, 'story_nearby_portal')
        if any(k in edge for k in ('boatSeconds', 'liftSeconds', 'waterwaySeconds', 'phaseSeconds')):
            ride = self.state.lift
            assert ride is not None and ride.destination == target, (origin, target, self.state.storyNotice)
            assert bool(ride.boat) == ('boatSeconds' in edge)
            assert bool(ride.waterway) == ('waterwaySeconds' in edge)
            assert bool(ride.phase) == ('phaseSeconds' in edge)
            if edge.get('animatedLift'):
                assert ride.riders is not None
                before = self.actor.y
                self.core.step(self.state, 1 / 60, self.idle)
                assert self.actor.y != before and self.state.story.node == origin
                if edge.get('windLift'):
                    assert ride.windLift and not ride.wallTrack and not ride.spiritwayTrack
                    assert (self.actor.y < before) == (edge['arrivalY'] < edge.get('y',480))
            for _ in range(360):
                if self.state.lift is None:
                    break
                self.core.step(self.state, 1 / 60, self.idle)
        assert self.state.story.node == target and self.state.lift is None, (
            origin, target, self.state.story.node, self.state.storyNotice)
        if 'arrivalX' in edge:
            expected_x = edge['arrivalX'] - (self.state.active - 1) * 40
            if self.state.storySwimming:
                expected_x = max(20, expected_x)
            assert (self.actor.x, self.actor.y) == (expected_x, edge.get('arrivalY', 480))
        self.crossings.add((origin, target))

    def explore(self):
        visited = {self.state.story.node}

        def follow():
            origin = self.state.story.node
            for gate in self.exits[origin]:
                target = gate['to']
                pair = origin, target
                if pair not in self.edges or pair in self.crossings:
                    continue
                self.cross(target)
                if target not in visited:
                    visited.add(target)
                    follow()
                self.cross(origin)

        follow()
        return visited
