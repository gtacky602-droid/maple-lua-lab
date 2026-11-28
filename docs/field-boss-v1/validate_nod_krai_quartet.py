#!/usr/bin/env python3
"""Validate Nod-Krai design declarations, not executable combat behavior.

Explicit exceptions keep every check active under python -O.
--check-runtime-source compares old JSON data, including Battleship's coolingMove
outside moves. It does not run Lua; omit it after intentional runtime migration.
"""
import argparse
import copy
import json
import math
from pathlib import Path


EXPECTED = {
    "boss-24100101": ("FDK", "field-knuckle-duckle.lua"),
    "boss-23090101": ("FBT", "field-battleship.lua"),
    "boss-20081001": ("FHR", "field-frostnight-herra.lua"),
    "boss-22150101": ("FWN", "field-whisperer-nightmares.lua"),
}
AIR_MOVES = {"FDK02", "FHR02"}
HIDDEN_MOVES = {"FWN02"}
PREVIOUS_CHECKPOINT = (38, 114)  # Design-index counts, not runtime completion.
SAME_TICK_ORDER = [
    "apply_eligible_player_damage", "hp_zero",
    "valid_unit_deaths_and_plate_chips", "optional_interrupt",
    "deadline_cleanup", "scheduled_enemy_hits",
]
REMOVED_GATES = {
    "duck_ward_factor", "duck_hp_repair", "duck_ward_chip_gauge",
    "ship_pyro_heat_gate", "ship_onhit_cast_replacement",
    "ship_hot_damage_factor", "ship_ward_damage_factor",
    "herra_gloom_damage_factor", "herra_element_adaptation",
    "herra_three_charge_gate", "nightmare_hp_shield",
    "nightmare_full_arena_release", "nightmare_four_add_loop",
}


class InvalidDesign(ValueError):
    """A schema, relationship, or migration declaration is invalid."""


def require(condition, message):
    if not condition:
        raise InvalidDesign(message)


def fields(value, required, path):
    require(type(value) is dict, path + ": object required")
    missing = sorted(set(required) - value.keys())
    require(not missing, path + ": missing required keys: " + ", ".join(missing))
    return value


def integer(value):
    return type(value) is int


def number(value):
    return type(value) in (int, float) and math.isfinite(value)


def positive(value, path, ticks=False):
    require((integer(value) if ticks else number(value)) and value > 0,
            path + (": positive integer required" if ticks else ": positive finite number required"))


def exact(value, expected, path):
    require(type(value) is type(expected) and value == expected,
            f"{path}: expected {expected!r}, got {value!r}")


def fixed_values(value, expected, path):
    fields(value, expected, path)
    for key, expected_value in expected.items():
        exact(value[key], expected_value, path + "." + key)


def flags(value, path, true=(), false=()):
    fixed_values(value, {**dict.fromkeys(true, True), **dict.fromkeys(false, False)}, path)


def string_list(value, path):
    require(type(value) is list and all(type(x) is str and x for x in value),
            path + ": list of nonempty strings required")
    require(len(value) == len(set(value)), path + ": duplicate entries")
    return value


def same_members(value, expected, path):
    actual = set(string_list(value, path))
    expected = set(expected)
    require(actual == expected,
            f"{path}: missing={sorted(expected - actual)}, unexpected={sorted(actual - expected)}")


def rows_by_id(value, path):
    require(type(value) is list, path + ": array required")
    result = {}
    for index, row in enumerate(value):
        here = f"{path}[{index}]"
        fields(row, ("id",), here)
        identifier = row["id"]
        require(type(identifier) is str and identifier, here + ".id: nonempty string required")
        require(identifier not in result, here + ": duplicate ID " + identifier)
        result[identifier] = row
    return result


def interval(value, limit, path):
    require(type(value) is list and len(value) == 2, path + ": two-item interval required")
    require(all(integer(x) for x in value), path + ": integer ticks required (booleans are invalid)")
    require(0 <= value[0] < value[1] <= limit,
            f"{path}: require 0 <= start < end <= {limit}; got {value!r}")
    return value


def extent(value, path):
    require(type(value) is list and len(value) == 2 and all(number(x) for x in value),
            path + ": two finite coordinates required")
    require(0 <= value[0] < value[1], path + ": positive ordered extent required")
    return value


def shape(value, path):
    fields(value, ("kind", "z"), path)
    extent(value["z"], path + ".z")
    if value["kind"] == "locked_rect":
        fields(value, ("u",), path)
        extent(value["u"], path + ".u")
    elif value["kind"] == "locked_target_rect":
        fixed_values(value, {"center_policy": "front_target_at_lock", "arena_clamp": False}, path)
        fields(value, ("max_center_distance_u", "width_u"), path)
        positive(value["max_center_distance_u"], path + ".max_center_distance_u")
        positive(value["width_u"], path + ".width_u")
    else:
        raise InvalidDesign(path + ": unsupported shape " + repr(value["kind"]))


def validate_interrupt(value, path):
    fields(value, ("down_ticks", "standup_ticks"), path)
    positive(value["down_ticks"], path + ".down_ticks", ticks=True)
    positive(value["standup_ticks"], path + ".standup_ticks", ticks=True)
    flags(value, path, true=("cancel_all_pending_hits", "once_per_parent_cast",
                            "returns_to_normal_selector"))


def validate_summons(value, moves, move_id, path):
    fields(value, ("move_id", "count", "spawn_tick", "despawn_tick", "offsets_u",
                   "death_interrupt_window", "required_valid_deaths", "valid_death_causes",
                   "instance_key", "death_dedup_key", "source_hp_comparison", "interrupt"), path)
    fixed_values(value, {"move_id": move_id, "count": 2, "side": "locked_facing_only",
                        "contact_damage": 0, "reward_count": 0, "special_lunar_multiplier": 1}, path)
    flags(value, path,
          true=("actual_damage_receivers", "normal_damage_pipeline", "targetable",
                "independent_aura", "dot_and_reaction_deaths_count", "cancel_with_parent"),
          false=("body_collision", "transfers_damage_to_boss", "independent_ai",
                 "counts_as_quest_kill", "counts_as_progression_kill", "heals_boss_hp",
                 "arrival_counts_as_death", "cleanup_counts_as_death"))
    parent = moves[move_id]
    spawn, despawn = value["spawn_tick"], value["despawn_tick"]
    require(integer(spawn) and integer(despawn) and
            parent["lock"] <= spawn < despawn <= parent["recovery"][0],
            path + ": lifetime must follow LOCK and finish before recovery")
    interval(value["death_interrupt_window"], parent["total"], path + ".death_interrupt_window")
    exact(value["death_interrupt_window"], [spawn, despawn], path + ".death_interrupt_window")
    exact(value["required_valid_deaths"], value["count"], path + ".required_valid_deaths")
    offsets = value["offsets_u"]
    require(type(offsets) is list and len(offsets) == value["count"] and
            all(number(x) and x > 0 for x in offsets) and offsets == sorted(set(offsets)),
            path + ".offsets_u: distinct ordered positions on the locked front side required")
    positive(value["source_hp_comparison"], path + ".source_hp_comparison")
    same_members(value["valid_death_causes"], ("player_damage", "active_companion_damage"),
                 path + ".valid_death_causes")
    same_members(value["instance_key"], ("epoch", "encounter_id", "parent_cast_id", "slot"),
                 path + ".instance_key")
    same_members(value["death_dedup_key"], ("epoch", "parent_cast_id", "unit_id"),
                 path + ".death_dedup_key")
    validate_interrupt(value["interrupt"], path + ".interrupt")
    parent_hits = [event for event in parent["events"] if event["owner"] == "boss"]
    require(parent_hits and all(event["active"][0] >= despawn for event in parent_hits),
            path + ": parent release must follow summon cleanup deadline")


def validate(data, catalog, config=None):
    fields(data, ("counts", "shared", "identity_contract", "bosses", "attacks",
                  "repair_ducks", "fishers", "cooling_plate", "removed_runtime_gates", "migration"),
           "manifest")
    fixed_values(data, {"schema_version": "1.0", "status": "design_only_not_runtime",
                       "tick_rate_hz": 60, "unit_U_pixels": 88, "interval_semantics": "half_open"},
                 "manifest")
    shared = data["shared"]
    fixed_values(shared, {"max_attack_patterns": 3, "max_concurrent_casts": 1, "boss_hp_bars": 1,
                         "passive_contact_damage": 0, "signature_recovery_ticks": 144,
                         "max_air_or_hidden_ticks": 36,
                         "selector": "two_normals_then_signature_when_not_killed",
                         "unreachable_cast_policy": "cancel_before_lock_reposition_then_new_tell",
                         "geometry_origin": "boss_lock_origin_even_for_child_owners",
                         "hit_history": "allocate_by_event_group_not_fixed_two_slots"},
                 "shared")
    flags(shared, "shared", true=("hp_zero_priority", "normal_damage_pipeline", "lock_freezes_facing_and_targets"),
          false=("multiplayer_hp_scaling", "required_special_element", "forced_revive_phase",
                 "runtime_or_visual_tested", "hp_lock_to_force_signature", "all_arena_attack",
                 "body_blocking_crossing_required"))
    fields(shared, ("cleanup", "same_tick_order", "retreat_margin_u"), "shared")
    positive(shared["retreat_margin_u"], "shared.retreat_margin_u")
    same_members(shared["cleanup"], ("pending_hits", "summons", "plate", "gloom",
                                    "ground_markers", "old_epoch_events"), "shared.cleanup")
    exact(shared["same_tick_order"], SAME_TICK_ORDER, "shared.same_tick_order")
    identity = data["identity_contract"]
    flags(identity, "identity_contract",
          true=("same_actor", "same_receiver", "same_hp", "preserve_aura", "preserve_dot",
                "preserve_target", "air_hurtbox_follows_visible_body", "hidden_dot_continues"),
          false=("hidden_accepts_new_direct_hits", "hidden_marker_is_receiver"))
    fixed_values(identity, {"transformation_invulnerable_ticks": 0, "reward_count": 1}, "identity_contract")
    fixed_values(data["removed_runtime_gates"], dict.fromkeys(REMOVED_GATES, False), "removed_runtime_gates")

    bosses = rows_by_id(data["bosses"], "bosses")
    moves = rows_by_id(data["attacks"], "attacks")
    same_members(list(bosses), EXPECTED, "boss IDs")
    expected_moves = {prefix + suffix for prefix, _ in EXPECTED.values() for suffix in ("01", "02", "03")}
    same_members(list(moves), expected_moves, "attack IDs")
    fields(catalog, ("encounters",), "catalog")
    catalog_rows = rows_by_id(catalog["encounters"], "catalog.encounters")
    owners = {}
    signatures = set()
    for boss_id, (prefix, runtime_file) in EXPECTED.items():
        boss = fields(bosses[boss_id], ("name", "attacks", "signature", "existing_runtime",
                                      "preserve_source_fields"), boss_id)
        required_moves = [prefix + suffix for suffix in ("01", "02", "03")]
        exact(boss["attacks"], required_moves, boss_id + ".attacks")
        fixed_values(boss, {"signature": required_moves[-1], "existing_runtime": runtime_file,
                           "signature_boss_damage_factor": 1, "signature_boss_hp_shield": 0}, boss_id)
        signatures.add(boss["signature"])
        for index, move_id in enumerate(required_moves):
            require(move_id not in owners, move_id + ": multiple owners")
            owners[move_id] = boss_id
            exact(moves[move_id].get("kind"), "signature" if index == 2 else "normal", move_id + ".kind")
        saved = fields(boss["preserve_source_fields"],
                       ("controller", "node", "storyChallenge", "level", "hp", "mora"),
                       boss_id + ".preserve_source_fields")
        for key in ("controller", "node", "storyChallenge"):
            require(type(saved[key]) is str and saved[key], boss_id + "." + key + ": nonempty string required")
        for key in ("level", "hp", "mora"):
            positive(saved[key], boss_id + "." + key, ticks=True)
        require(boss_id in catalog_rows, "catalog: missing boss ID " + boss_id)
        original = fields(catalog_rows[boss_id], ("kind", "name", "entity_ids", "fieldNode"), "catalog." + boss_id)
        fixed_values(original, {"kind": "normal", "name": boss["name"], "fieldNode": saved["node"]},
                     "catalog." + boss_id)
        require(boss_id.removeprefix("boss-") in string_list(original["entity_ids"], "catalog.entity_ids"),
                "catalog." + boss_id + ": entity ID mismatch")
    require(set(owners) == set(moves), "boss attacks must form a complete, unique ownership mapping")

    windows = 0
    for move_id, move in moves.items():
        fields(move, ("lock", "recovery", "total", "events"), move_id)
        positive(move["total"], move_id + ".total", ticks=True)
        require(integer(move["lock"]) and 0 <= move["lock"] < move["total"], move_id + ".lock: invalid tick")
        recovery = interval(move["recovery"], move["total"], move_id + ".recovery")
        require(recovery[1] == move["total"] and recovery[0] > move["lock"],
                move_id + ": recovery must finish the cast after LOCK")
        if move_id in signatures:
            require(recovery[1] - recovery[0] == shared["signature_recovery_ticks"],
                    move_id + ": signature recovery must be 144 ticks")
        require(move.get("projectiles", []) == [], move_id + ": undeclared projectile route")
        events = move["events"]
        require(type(events) is list and events, move_id + ".events: nonempty array required")
        groups, previous_end = set(), move["lock"]
        for index, event in enumerate(events):
            path = f"{move_id}.events[{index}]"
            fields(event, ("group", "active", "owner", "shape", "element", "source_damage_comparison",
                           "hit_requests_per_receiver", "follows_after_lock", "damaging_projectile"), path)
            start, end = interval(event["active"], recovery[0], path + ".active")
            require(start - move["lock"] >= 30, path + ": LOCK-to-hit interval must be at least 30 ticks")
            require(start >= previous_end, path + ": damage windows must be ordered and nonoverlapping")
            previous_end = end
            require(type(event["group"]) is str and event["group"] and event["group"] not in groups,
                    path + ": missing or duplicate hit group")
            groups.add(event["group"])
            allowed = {"boss", "fisher_1", "fisher_2"} if move_id == "FWN03" else {"boss"}
            require(type(event["owner"]) is str and event["owner"] in allowed, path + ": invalid attack owner")
            require(type(event["element"]) is str and event["element"] in
                    {"physical", "pyro", "hydro", "cryo", "electro", "anemo", "geo", "dendro"},
                    path + ": invalid element")
            positive(event["source_damage_comparison"], path + ".source_damage_comparison")
            fixed_values(event, {"hit_requests_per_receiver": 1, "follows_after_lock": False,
                                 "damaging_projectile": False}, path)
            shape(event["shape"], path + ".shape")
        windows += len(events)

    air_moves = {move_id for move_id, move in moves.items() if "air" in move}
    hidden_moves = {move_id for move_id, move in moves.items() if "hidden" in move}
    require(air_moves == AIR_MOVES, "air routes: exactly FDK02 and FHR02 required")
    require(hidden_moves == HIDDEN_MOVES, "hidden routes: exactly FWN02 required")
    for move_id in air_moves | hidden_moves:
        move = moves[move_id]
        route = "air" if move_id in air_moves else "hidden"
        start, end = interval(move[route], move["recovery"][0], move_id + "." + route)
        require(end - start == shared["max_air_or_hidden_ticks"] and start >= move["lock"],
                move_id + ": air/hidden route must last 36 ticks after LOCK")
        exact(move.get("body_moves_to_locked_center"), True, move_id + ".body_moves_to_locked_center")
        first_hit = move["events"][0]["active"][0]
        if route == "air":
            require(end == first_hit, move_id + ": landing hit must start when air route ends")
            fields(move, ("lift_u",), move_id)
            positive(move["lift_u"], move_id + ".lift_u")
        else:
            fixed_values(move, {"visible_reappear_tell_ticks": 24, "ground_marker_persists": True}, move_id)
            require(first_hit - end == move["visible_reappear_tell_ticks"],
                    move_id + ": visible reappearance must precede the hit by 24 ticks")
    gloom = moves["FHR03"]
    fixed_values(gloom, {"same_center_for_all_events": True}, "FHR03")
    fields(gloom, ("gloom_visual_window",), "FHR03")
    interval(gloom["gloom_visual_window"], gloom["total"], "FHR03.gloom_visual_window")
    exact(gloom["gloom_visual_window"], [gloom["lock"], gloom["recovery"][0]], "FHR03.gloom_visual_window")
    require(all(event["shape"] == gloom["events"][0]["shape"] for event in gloom["events"]),
            "FHR03: both waves must use the same locked geometry")
    lunge = fields(moves["FWN01"], ("advance", "travel_u", "hitbox_anchor"), "FWN01")
    start, end = interval(lunge["advance"], lunge["recovery"][0], "FWN01.advance")
    require(lunge["events"][0]["active"][0] <= start < end <= lunge["events"][0]["active"][1],
            "FWN01: advance must be contained in its fixed damage window")
    positive(lunge["travel_u"], "FWN01.travel_u")
    exact(lunge["hitbox_anchor"], "lock_origin_not_moving_body", "FWN01.hitbox_anchor")

    ducks, fishers, plate = data["repair_ducks"], data["fishers"], data["cooling_plate"]
    validate_summons(ducks, moves, "FDK03", "repair_ducks")
    validate_summons(fishers, moves, "FWN03", "fishers")
    fixed_values(ducks, {"per_unit_attack_count": 0, "travel_policy": "each_lerps_from_own_spawn_to_arrival",
                        "stop_on_valid_death": True, "failure_buffs_boss": False}, "repair_ducks")
    fields(ducks, ("roll", "arrival_tick", "arrival_u"), "repair_ducks")
    roll = interval(ducks["roll"], moves["FDK03"]["total"], "repair_ducks.roll")
    require(ducks["spawn_tick"] <= roll[0] and roll[1] == ducks["arrival_tick"] == ducks["despawn_tick"]
            and integer(ducks["arrival_tick"]), "repair_ducks: roll/arrival/cleanup boundaries disagree")
    require(number(ducks["arrival_u"]) and 0 < ducks["arrival_u"] < min(ducks["offsets_u"]),
            "repair_ducks.arrival_u: front-side destination before both spawn positions required")
    fixed_values(fishers, {"per_unit_attack_count": 1, "individual_death_cancels_own_hit": True,
                          "attack_schedule": "parent_fixed_slots", "tracks_player_after_lock": False,
                          "repeated_attacks": False, "shield_on_summons": False}, "fishers")
    fields(fishers, ("attack_groups",), "fishers")
    same_members(fishers["attack_groups"], ("fisher_1", "fisher_2"), "fishers.attack_groups")
    child_events = [event for event in moves["FWN03"]["events"] if event["owner"] != "boss"]
    require(len(child_events) == fishers["count"], "fishers: one child attack per unit required")
    same_members([event["owner"] for event in child_events], fishers["attack_groups"], "fishers.event_owners")
    for group, offset in zip(fishers["attack_groups"], fishers["offsets_u"]):
        event = next(event for event in child_events if event["owner"] == group)
        require(event["group"] == group, "fishers: event group must identify its source unit")
        start, end = event["active"]
        require(fishers["spawn_tick"] + 30 <= start < end <= fishers["despawn_tick"],
                "fishers: child attack must follow spawn tell and precede despawn")
        require(event["shape"]["kind"] == "locked_rect" and
                event["shape"]["u"][0] <= offset <= event["shape"]["u"][1],
                "fishers: child attack rectangle must contain that unit's locked spawn position")

    fields(plate, ("move_id", "window", "layers", "physical_or_other_direct_chip", "pyro_direct_chip",
                   "shape", "allowed_sources", "cast_dedup_key", "interrupt"), "cooling_plate")
    fixed_values(plate, {"move_id": "FBT03", "reward_count": 0,
                        "cast_time_basis": "encounter_tick_minus_parent_start_tick"}, "cooling_plate")
    flags(plate, "cooling_plate",
          true=("body_damage_independent", "new_direct_casts_only", "cast_start_at_or_after_window_start",
                "same_epoch_required", "requires_actual_plate_overlap"),
          false=("is_hp_receiver", "transfers_damage_to_boss", "accept_reactions", "accept_dot_ticks",
                 "duplicate_cast_counts", "emits_duplicate_hit_hooks"))
    window = interval(plate["window"], moves["FBT03"]["recovery"][0], "cooling_plate.window")
    require(window[0] == moves["FBT03"]["lock"] and window[1] <= moves["FBT03"]["events"][0]["active"][0],
            "cooling_plate: acceptance must start at LOCK and finish before release")
    for key in ("layers", "physical_or_other_direct_chip", "pyro_direct_chip"):
        positive(plate[key], "cooling_plate." + key, ticks=True)
    require(plate["physical_or_other_direct_chip"] <= plate["pyro_direct_chip"] <= plate["layers"],
            "cooling_plate: physical path and bounded Pyro advantage required")
    shape(plate["shape"], "cooling_plate.shape")
    exact(plate["shape"]["kind"], "locked_rect", "cooling_plate.shape.kind")
    same_members(plate["allowed_sources"], ("real_player", "active_companion"), "cooling_plate.allowed_sources")
    same_members(plate["cast_dedup_key"], ("epoch", "source_actor_id", "cast_id"), "cooling_plate.cast_dedup_key")
    validate_interrupt(plate["interrupt"], "cooling_plate.interrupt")

    migration = fields(data["migration"], ("source_move_ids", "source_extra_move_fields", "source_attack_card_count",
        "target_attack_card_count", "source_signature_totals", "target_signature_totals", "source_air_ticks",
        "source_hidden_ticks"), "migration")
    flags(migration, "migration", true=("keep_existing_ids", "preserve_level_hp_rewards_save_and_placement",
          "remove_zero_shield_auto_down_hooks", "remove_legacy_independent_fisher_loop"),
          false=("runtime_changes_applied",))
    for key, expected_keys in (("source_move_ids", EXPECTED), ("source_signature_totals", signatures),
                               ("target_signature_totals", signatures), ("source_air_ticks", AIR_MOVES),
                               ("source_hidden_ticks", HIDDEN_MOVES)):
        fields(migration[key], expected_keys, "migration." + key)
        same_members(list(migration[key]), expected_keys, "migration." + key)
    exact(migration["source_extra_move_fields"], {"boss-23090101": ["coolingMove"]},
          "migration.source_extra_move_fields")
    for boss_id, boss in bosses.items():
        same_members(migration["source_move_ids"][boss_id], boss["attacks"], "migration.source_move_ids." + boss_id)
    for move_id in signatures:
        positive(migration["source_signature_totals"][move_id], "migration.source_signature_totals." + move_id, ticks=True)
        exact(migration["target_signature_totals"][move_id], moves[move_id]["total"],
              "migration.target_signature_totals." + move_id)
    for key in ("source_air_ticks", "source_hidden_ticks"):
        for move_id, duration in migration[key].items():
            positive(duration, "migration." + key + "." + move_id, ticks=True)
    old_count = sum(len(ids) for ids in migration["source_move_ids"].values())
    exact(migration["source_attack_card_count"], old_count, "migration.source_attack_card_count")
    exact(migration["target_attack_card_count"], len(moves), "migration.target_attack_card_count")
    require(old_count == len(moves), "migration: existing attack IDs/count must be preserved")

    counts = data["counts"]
    computed = {"encounters": len(bosses), "attack_cards": len(moves), "direct_windows": windows,
                "damaging_projectiles": 0, "air_routes": len(air_moves), "hidden_routes": len(hidden_moves),
                "optional_interrupt_rules": 3, "cumulative_encounters": PREVIOUS_CHECKPOINT[0] + len(bosses),
                "cumulative_attack_cards": PREVIOUS_CHECKPOINT[1] + len(moves), "catalog_reference_rows": 49,
                "remaining_reference_rows": 49 - PREVIOUS_CHECKPOINT[0] - len(bosses),
                "all_catalog_rows_detailed": False}
    fixed_values(counts, computed, "counts")
    require(windows == 18, f"direct windows: expected 18, found {windows}")
    normal_rows = sum(row.get("kind") == "normal" for row in catalog_rows.values())
    require(normal_rows >= counts["catalog_reference_rows"], "catalog: fewer normal rows than the 49-row reference")
    if config is not None:
        validate_runtime_source(config, bosses, moves, migration, data)
    return {**computed, "current_catalog_normal_rows": normal_rows}


def validate_runtime_source(config, bosses, moves, migration, data):
    fields(config, ("fieldBosses",), "runtime_source")
    configured = rows_by_id(config["fieldBosses"], "runtime_source.fieldBosses")
    for boss_id, boss in bosses.items():
        require(boss_id in configured, "runtime_source: missing boss ID " + boss_id)
        old = fields(configured[boss_id], ("moves",), "runtime_source." + boss_id)
        fixed_values(old, boss["preserve_source_fields"], "runtime_source." + boss_id)
        old_moves = rows_by_id(old["moves"], "runtime_source." + boss_id + ".moves")
        cooling = old_moves.get("FBT03")
        if cooling and cooling.get("kind") == "plate":
            target = moves["FBT03"]
            plate = data["cooling_plate"]
            fixed_values(cooling, {
                "lock": plate["window"][0], "plateClose": plate["window"][1],
                "plateNear": plate["shape"]["u"][0], "plateFar": plate["shape"]["u"][1],
                "plateLow": plate["shape"]["z"][0], "plateHigh": plate["shape"]["z"][1],
                "plateLayers": plate["layers"], "pyroChip": plate["pyro_direct_chip"],
                "downTicks": plate["interrupt"]["down_ticks"], "standTicks": plate["interrupt"]["standup_ticks"],
                "active": [event["active"] for event in target["events"]],
                "recover": target["recovery"][0], "total": target["total"],
            }, "runtime_source.FBT03")
            require(old.get("attackPulse") is True and "thermal" not in old and "coolingMove" not in old,
                    "runtime_source.FBT03: plate requires direct attack pulses and its own move")
        else:
            cooling = None
        for field in migration["source_extra_move_fields"].get(boss_id, []):
            if cooling and field == "coolingMove":
                continue
            fields(old, (field,), "runtime_source." + boss_id)
            extra = rows_by_id([old[field]], "runtime_source." + boss_id + "." + field)
            require(not (old_moves.keys() & extra.keys()), "runtime_source: duplicate extra move ID")
            old_moves.update(extra)
        same_members(list(old_moves), migration["source_move_ids"][boss_id], "runtime_source." + boss_id + ".move_ids")
        discharge = old_moves.get("FDK03")
        if discharge and discharge.get("kind") == "discharge":
            target = moves["FDK03"]
            repairs = data["repair_ducks"]
            fixed_values(discharge, {
                "lock": target["lock"], "deploy": repairs["spawn_tick"],
                "expire": repairs["despawn_tick"], "repairHp": repairs["source_hp_comparison"],
                "repairOffsets": repairs["offsets_u"], "active": [event["active"] for event in target["events"]],
                "recover": target["recovery"][0], "total": target["total"],
            }, "runtime_source.FDK03")
            require("ward" not in old, "runtime_source.FDK03: discharge still has a legacy ward")
        else:
            discharge = None
        short_gloom = boss_id == "boss-20081001" and "gloom" not in old
        if short_gloom:
            for move_id in ("FHR02", "FHR03"):
                target = moves[move_id]
                timings = {"lock": target["lock"], "active": [event["active"] for event in target["events"]],
                           "recover": target["recovery"][0], "total": target["total"]}
                if "air" in target:
                    timings["air"] = target["air"]
                fixed_values(old_moves[move_id], timings, "runtime_source." + move_id)
        short_nightmare = boss_id == "boss-22150101" and "ward" not in old
        if short_nightmare:
            rift, sequence = moves["FWN02"], moves["FWN03"]
            units = data["fishers"]
            child_events = sequence["events"][:2]
            fixed_values(old_moves["FWN02"], {
                "hide": rift["hidden"], "lock": rift["lock"], "active": [event["active"] for event in rift["events"]],
                "recover": rift["recovery"][0], "total": rift["total"],
            }, "runtime_source.FWN02")
            fixed_values(old_moves["FWN03"], {
                "kind": "sequence", "lock": sequence["lock"], "deploy": units["spawn_tick"],
                "expire": units["despawn_tick"], "fisherHp": units["source_hp_comparison"],
                "fisherDamage": child_events[0]["source_damage_comparison"],
                "fishers": [{"offset": offset, "near": event["shape"]["u"][0], "far": event["shape"]["u"][1]}
                            for offset, event in zip(units["offsets_u"], child_events)],
                "active": [event["active"] for event in sequence["events"]],
                "recover": sequence["recovery"][0], "total": sequence["total"],
            }, "runtime_source.FWN03")
        for move_id, old_move in old_moves.items():
            fields(old_move, ("total", "damage"), "runtime_source." + move_id)
            promoted = (old_move is discharge or old_move is cooling
                        or short_gloom and move_id in ("FHR02", "FHR03")
                        or short_nightmare and move_id in ("FWN02", "FWN03"))
            if not promoted and move_id in migration["source_signature_totals"]:
                exact(old_move["total"], migration["source_signature_totals"][move_id], "runtime_source." + move_id + ".total")
            for table, key in (("source_air_ticks", "air"), ("source_hidden_ticks", "hide")):
                if not promoted and move_id in migration[table]:
                    fields(old_move, (key,), "runtime_source." + move_id)
                    start, end = interval(old_move[key], old_move["total"], "runtime_source." + move_id + "." + key)
                    exact(end - start, migration[table][move_id], "runtime_source." + move_id + "." + key + "_ticks")
            for event in moves[move_id]["events"]:
                if event["owner"] == "boss":
                    exact(event["source_damage_comparison"], old_move["damage"], "runtime_source." + move_id + ".damage")
        if not discharge and not short_nightmare and boss_id in ("boss-24100101", "boss-22150101"):
            section = "repair_ducks" if boss_id == "boss-24100101" else "fishers"
            fields(old, ("ward",), "runtime_source." + boss_id)
            fields(old["ward"], ("unitHp",), "runtime_source." + boss_id + ".ward")
            exact(data[section]["source_hp_comparison"], old["ward"]["unitHp"], "runtime_source." + section + ".unitHp")
            if section == "fishers":
                fields(old["ward"], ("fisherDamage",), "runtime_source.fishers.ward")
                for event in moves["FWN03"]["events"]:
                    if event["owner"] != "boss":
                        exact(event["source_damage_comparison"], old["ward"]["fisherDamage"], "runtime_source.fishers.damage")


def self_test(data, catalog, config=None):
    """Mutation tests check relationships; failures must have deliberate reasons."""
    positions = {move["id"]: index for index, move in enumerate(data["attacks"])}

    def move_path(move_id, *tail):
        return ("attacks", positions[move_id], *tail)

    def changed(source, edits):
        result = copy.deepcopy(source)
        for path, value, remove in edits:
            target = result
            for part in path[:-1]:
                target = target[part]
            if remove:
                del target[path[-1]]
            else:
                target[path[-1]] = value
        return result

    def edit(path, value):
        return (path, value, False)

    duck_punch = data["attacks"][positions["FDK01"]]
    duck_air = data["attacks"][positions["FDK02"]]
    hidden = data["attacks"][positions["FWN02"]]
    signature = data["attacks"][positions["FDK03"]]
    fisher_move = data["attacks"][positions["FWN03"]]
    bad_order = SAME_TICK_ORDER.copy()
    bad_order[1], bad_order[-1] = bad_order[-1], bad_order[1]
    cases = [
        ("missing nested key", "missing required keys", [(move_path("FDK01", "events", 0, "owner"), None, True)]),
        ("duplicate move ID", "duplicate ID", [edit(move_path("FDK02", "id"), "FDK01")]),
        ("boolean tick", "integer ticks", [edit(move_path("FDK01", "events", 0, "active", 0), True)]),
        ("29-tick LOCK warning", "LOCK-to-hit", [edit(move_path("FDK01", "lock"), duck_punch["events"][0]["active"][0] - 29)]),
        ("overlapping windows", "nonoverlapping", [edit(move_path("FDK01", "events", 1, "active", 0), duck_punch["events"][0]["active"][1] - 1)]),
        ("damage in recovery", "start < end", [edit(move_path("FDK01", "events", 1, "active", 1), duck_punch["recovery"][0] + 1)]),
        ("143-tick signature recovery", "signature recovery", [
            edit(move_path("FDK03", "total"), signature["total"] - 1),
            edit(move_path("FDK03", "recovery", 1), signature["total"] - 1),
            edit(("migration", "target_signature_totals", "FDK03"), signature["total"] - 1)]),
        ("undeclared damage projectile", "damaging_projectile", [edit(move_path("FDK01", "events", 0, "damaging_projectile"), True)]),
        ("37-tick air route", "36 ticks", [edit(move_path("FDK02", "air", 0), duck_air["air"][0] - 1)]),
        ("37-tick hidden route", "36 ticks", [edit(move_path("FWN02", "hidden", 0), hidden["hidden"][0] - 1)]),
        ("23-tick visible warning", "24 ticks", [edit(move_path("FWN02", "hidden"), [x + 1 for x in hidden["hidden"]])]),
        ("child attack attributed to boss", "parent release", [edit(move_path("FWN03", "events", 0, "owner"), "boss")]),
        ("overlapping child windows", "nonoverlapping", [edit(move_path("FWN03", "events", 1, "active", 0), fisher_move["events"][0]["active"][1] - 1)]),
        ("summon on opposite side", "locked front side", [edit(("fishers", "offsets_u", 0), -0.85)]),
        ("death accepted after despawn", "death_interrupt_window", [edit(("fishers", "death_interrupt_window", 1), data["fishers"]["despawn_tick"] + 1)]),
        ("cleanup counted as death", "cleanup_counts_as_death", [edit(("fishers", "cleanup_counts_as_death"), True)]),
        ("instance lacks epoch", "instance_key", [edit(("repair_ducks", "instance_key"), [x for x in data["repair_ducks"]["instance_key"] if x != "epoch"])]),
        ("death dedup lacks unit", "death_dedup_key", [edit(("fishers", "death_dedup_key"), ["epoch", "parent_cast_id"])]),
        ("no physical plate path", "physical_or_other_direct_chip", [edit(("cooling_plate", "physical_or_other_direct_chip"), 0)]),
        ("stale plate event", "same_epoch_required", [edit(("cooling_plate", "same_epoch_required"), False)]),
        ("cast dedup lacks actor", "cast_dedup_key", [edit(("cooling_plate", "cast_dedup_key"), ["epoch", "cast_id"])]),
        ("ineligible plate source", "allowed_sources", [edit(("cooling_plate", "allowed_sources"), ["real_player", "active_companion", "inactive_companion"])]),
        ("enemy hit before HP0", "same_tick_order", [edit(("shared", "same_tick_order"), bad_order)]),
        ("main HP shield", "signature_boss_hp_shield", [edit(("bosses", 0, "signature_boss_hp_shield"), 1)]),
        ("migration count drift", "source_attack_card_count", [edit(("migration", "source_attack_card_count"), len(data["attacks"]) - 1)]),
        ("wrong declared window count", "counts.direct_windows", [edit(("counts", "direct_windows"), data["counts"]["direct_windows"] - 1)]),
    ]
    for name, expected_error, edits in cases:
        try:
            validate(changed(data, edits), catalog, config)
        except InvalidDesign as error:
            require(expected_error in str(error), f"negative fixture {name!r} failed for the wrong reason: {error}")
        else:
            raise InvalidDesign("negative fixture accepted: " + name)
    # Legal boundary changes must pass: this is not an exact-value snapshot test.
    positives = [
        [edit(move_path("FDK01", "lock"), duck_punch["events"][0]["active"][0] - 30)],
        [edit(move_path("FDK01", "events", 1, "active", 0), duck_punch["events"][0]["active"][1])],
        [edit(("cooling_plate", "layers"), data["cooling_plate"]["layers"] + 1)],
    ]
    for edits in positives:
        validate(changed(data, edits), catalog)
    runtime_cases = 0
    if config is not None:
        ship_index = next(i for i, row in enumerate(config["fieldBosses"]) if row["id"] == "boss-23090101")
        source_field = "coolingMove" if "coolingMove" in config["fieldBosses"][ship_index] else "attackPulse"
        for name, path, value, remove in (
            ("missing cooling setup", ("fieldBosses", ship_index, source_field), None, True),
            ("changed preserved HP", ("fieldBosses", ship_index, "hp"), config["fieldBosses"][ship_index]["hp"] + 1, False),
        ):
            bad_config = changed(config, [(path, value, remove)])
            try:
                validate(data, catalog, bad_config)
            except InvalidDesign:
                runtime_cases += 1
            else:
                raise InvalidDesign("runtime-source negative fixture accepted: " + name)
    return len(cases), len(positives), runtime_cases


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", nargs="?", type=Path,
                        default=Path(__file__).with_name("MANIFEST_NOD_KRAI_QUARTET.json"))
    parser.add_argument("--self-test", action="store_true", help="run invalid fixtures and valid boundary cases")
    parser.add_argument("--check-runtime-source", action="store_true",
                        help="compare the runtime JSON with preserved values and migrated moves; does not execute Lua")
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[2]
    try:
        data = json.loads(args.manifest.read_text(encoding="utf-8"))
        catalog = json.loads((root / "content/encounters.json").read_text(encoding="utf-8"))
        config = (json.loads((root / "content/field-boss-spawns.json").read_text(encoding="utf-8"))
                  if args.check_runtime_source else None)
        summary = validate(data, catalog, config)
        negatives, positives, runtime_negatives = self_test(data, catalog, config) if args.self_test else (0, 0, 0)
    except (InvalidDesign, OSError, json.JSONDecodeError) as error:
        parser.exit(1, "FAIL: " + str(error) + "\n")
    print(f"PASS: {summary['encounters']} encounters / {summary['attack_cards']} attacks / "
          f"{summary['direct_windows']} direct windows / {summary['air_routes']} air routes / "
          f"{summary['hidden_routes']} hidden route")
    print(f"PASS: design checkpoint {summary['cumulative_encounters']} encounters / "
          f"{summary['cumulative_attack_cards']} attacks; 49-row reference has "
          f"{summary['remaining_reference_rows']} rows remaining")
    print(f"PASS: 4 catalog IDs/names/placements checked; current catalog has "
          f"{summary['current_catalog_normal_rows']} normal rows (reference count is 49)")
    print("PASS: REC144, bounded air/hide, ordered child hits, optional interrupts, source/state and cleanup declarations")
    if args.check_runtime_source:
        print("PASS: 12 runtime move IDs, preserved fields and migrated timings match")
    if args.self_test:
        print(f"PASS: {negatives} invalid design fixtures rejected / {positives} valid boundary fixtures accepted / "
              f"{runtime_negatives} invalid runtime-source fixtures rejected")
    print("LIMIT: static declarations only; Lua, rendering, hit geometry, evasion, and the 45-90 second goal are not tested")


if __name__ == "__main__":
    main()
