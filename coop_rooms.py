"""Room membership and per-map simulation for the local Lua cooperative preview."""

from dataclasses import dataclass, field
import json
import secrets

from runtime import ROOT, native


RULES = json.loads((ROOT / 'content/coop-preview.json').read_text(encoding='utf8'))
TICK = 1 / 60
MAX_TICKS = 6


@dataclass
class Room:
    code: str
    lua: object
    core: object
    last: float
    worlds: dict = field(default_factory=dict)
    members: list = field(default_factory=list)
    lag: float = 0
    next_slot: int = 0


def location(env):
    story = env['state'].story
    return story.node if story and story.active else None


def shareable(env, site):
    return site in RULES['nodes'] and env['core'].canShareCoopNode(env['state'])


class CoopRooms:
    def __init__(self):
        self.rooms = {}

    def attach(self, room, env):
        env['coop_room'] = room
        room.next_slot += 1
        env['coop_member'] = room.lua.table(id=room.next_slot, state=env['state'], online=True)
        if not env.get('coop_rng_seeded'):
            env['state'].inventory.rng = secrets.randbelow(2147483646) + 1
            env['coop_rng_seeded'] = True
        room.members.append(env)
        self.update_location(env)
        env['coop_notice'] = '協力部屋に入りました。'

    def detach(self, env, notice=None):
        room = env.pop('coop_room', None)
        if room is None:
            return
        member = env.pop('coop_member')
        room.core.detachCoop(member)
        room.members[:] = [row for row in room.members if row is not env]
        if not room.members:
            self.rooms.pop(room.code)
        env['coop_notice'] = notice or '協力部屋から出ました。'

    def update_location(self, env):
        room = env.get('coop_room')
        if room is None:
            return
        site = location(env)
        if site is None:
            self.detach(env, '通常の冒険を離れて協力部屋から出ました。')
            return
        state = env['state']
        sharing = room.core.sharesCoopField(state)
        open_battle = room.core.canShareCoopNode(state)
        if sharing and open_battle:
            return
        member = env['coop_member']
        if state.coop is not None:
            room.core.detachCoop(member, sharing)
        if open_battle and site in RULES['nodes']:
            rank = room.core.weeklyCoopMode(state)
            variant = room.core.weeklyCoopVariant(state)
            # A multi-scene weekly keeps one world keyed by its entrance.
            anchor = room.core.weeklyCoopSite(state) or site
            world_key = anchor
            if variant:
                world_key = (anchor, rank, variant.key)
            elif rank:
                world_key = (anchor, rank)
            if world_key not in room.worlds:
                room.worlds[world_key] = room.core.newCoop(state)
            room.core.attachCoop(room.worlds[world_key], state, member)

    def command(self, env, action, now):
        if action == 'coop_leave':
            self.detach(env)
            return True
        joining = action.startswith('coop_join:')
        if not joining and action != 'coop_create':
            return False

        def unavailable(message):
            env['coop_notice'] = message
            return True

        if env.get('coop_room'):
            return unavailable('すでに協力部屋にいます。')
        site = location(env)
        if env['rank_player'] or not shareable(env, site):
            return unavailable('通常の冒険で指定のマップに着くと参加できます。')
        if joining:
            code = action.removeprefix('coop_join:').upper()
            room = self.rooms.get(code)
            if not room:
                return unavailable('協力部屋の合言葉を確認してください。')
            if len(room.members) >= RULES['capacity']:
                return unavailable('この部屋は満員です。')
            if any(row['dailyProfile'] == env['dailyProfile'] for row in room.members):
                return unavailable('別のブラウザプロフィールで参加してください。')
            # Migrate at the map boundary using the normal checkpoint schema.
            source = env['state']
            checkpoint = native(env['core'].checkpoint(source))
            state = room.core.restore(room.lua.table_from(checkpoint, recursive=True), source.density)
            rank = env['core'].weeklyCoopMode(source)
            if source.azhdahaPair:
                state.azhdahaPair = room.lua.table_from(native(source.azhdahaPair))
            entrance = env['core'].weeklyCoopSite(source) or site
            room.core.enterCoopNode(state, entrance, rank)
            for index in (1, 2):
                actor, original = state.actors[index], source.actors[index]
                if entrance == site:
                    actor.x, actor.y, actor.vy = original.x, original.y, original.vy
                    actor.dir, actor.ground = original.dir, original.ground
                actor.hp, actor.inv = min(actor.maxhp, original.hp), original.inv
            env.update(lua=room.lua, core=room.core, state=state)
        else:
            code = secrets.token_hex(4).upper()
            while code in self.rooms:
                code = secrets.token_hex(4).upper()
            lua, core, state = env['lua'], env['core'], env['state']
            room = Room(code, lua, core, now)
            self.rooms[code] = room
        self.attach(room, env)
        return True

    def participants(self, env, now):
        room = env.get('coop_room')
        if room is None:
            return [env]
        live = []
        for row in room.members:
            online = not row.get('retire_at') and now - row['last'] < RULES['presenceSeconds']
            member = row['coop_member']
            member.online = online
            if now - row['last'] >= RULES['inputLeaseSeconds'] or not online:
                member.input = None
            if online:
                live.append(row)
        return live

    def advance(self, room, now):
        room.lag += min(max(0, now - room.last), MAX_TICKS * TICK)
        room.last = now
        steps = min(MAX_TICKS, int((room.lag + 1e-8) / TICK))
        room.lag = max(0, room.lag - steps * TICK)
        for _ in range(steps):
            # Snapshot private sessions before stepping. A transition is reconciled
            # only after all maps tick so a party cannot step twice in one tick.
            private = [row['coop_member'] for row in room.members
                       if row['coop_member'].online and row['state'].coop is None]
            for world in room.worlds.values():
                room.core.stepCoop(world, TICK)
            for member in private:
                room.core.step(member.state, TICK, member.input)
            for env in room.members[:]:
                self.update_location(env)

    def view(self, env):
        site = location(env)
        room = env.get('coop_room')
        view = dict(eligible=not env['rank_player'] and shareable(env, site),
                    sites=list(RULES['nodes'].values()), capacity=RULES['capacity'],
                    notice=env.get('coop_notice'))
        if room:
            state = env['state']
            world = state.coop
            peers = []
            for row in room.members:
                if row is env:
                    continue
                peer = native(room.core.coopPeer(row['coop_member'], world))
                peer['actors'] = peer['actors'] or []
                peers.append(peer)
            if world is not None:
                view.update(native(room.core.coopFrame(state)))
            view.update(code=room.code, slot=env['coop_member'].id, map=site,
                        shared=world is not None, peers=peers, enemies=view.get('enemies') or [])
        return view
