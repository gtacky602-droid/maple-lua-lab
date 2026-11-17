#!/usr/bin/env python3
"""Validate design timing/contracts only; does not execute the game.
Run: python docs/field-boss-v1/validate_natlan_origins.py
Standard library only. Explicit exceptions remain active under python -O.
"""
from __future__ import annotations
import copy
import hashlib
import json
from pathlib import Path

EXPECTED = {
    "boss-26220301": ["FYM01", "FYM02", "FYM03"],
    "boss-26230301": ["FQT01", "FQT02", "FQT03"],
    "boss-24090201": ["FSC01", "FSC02", "FSC03"],
    "boss-22120101": ["FMP01", "FMP02", "FMP03"],
}

def need(condition, message):
    if not condition:
        raise ValueError(message)

def integer(value):
    return type(value) is int

def interval(value):
    return (isinstance(value, list) and len(value) == 2
            and all(integer(x) for x in value) and 0 <= value[0] < value[1])

def validate(data):
    need(data["status"] == "design_only_not_runtime", "scope")
    need(data["tick_rate_hz"] == 60 and data["unit_U_pixels"] == 88, "units")
    need(data["interval_semantics"] == "half_open", "interval semantics")
    c, shared = data["counts"], data["shared"]
    need(c["encounters"] == 4 and c["attack_cards"] == 12, "batch counts")
    need(c["cumulative_encounters"] == 35 and c["cumulative_attack_cards"] == 105, "cumulative counts")
    need(c["optional_interrupts"] == 1 and c["catalog_reference_rows"] == 49, "catalog counts")
    need(c["all_catalog_rows_detailed"] is False, "coverage claim")
    for k in ("multiplayer_hp_scaling", "required_special_element", "forced_revive_phase", "runtime_or_visual_tested"):
        need(shared[k] is False, k)
    for k in ("hp_zero_priority", "normal_damage_pipeline"):
        need(shared[k] is True, k)
    need(shared["hp_bars"] == 1 and shared["max_concurrent_casts"] == 1 and shared["max_attack_patterns"] == 3, "budget")
    bosses, attacks = data["bosses"], data["attacks"]
    need(len(bosses) == 4 and len(attacks) == 12, "actual counts")
    need(len({b["id"] for b in bosses}) == 4, "duplicate boss")
    need(len({a["id"] for a in attacks}) == 12, "duplicate attack")
    by_id = {a["id"]: a for a in attacks}
    need(set(by_id) == {x for ids in EXPECTED.values() for x in ids}, "attack set")
    by_boss = {b["id"]: b for b in bosses}
    need(set(by_boss) == set(EXPECTED), "boss set")
    for b in bosses:
        need(b["attacks"] == EXPECTED[b["id"]], "ownership references")
        need(b["signature"] in b["attacks"], "signature")
        need(0 <= b["hurtbox_bottom_u"] <= 0.5, "ground receiver")
        need(all(by_id[i]["owner"] == b["id"] for i in b["attacks"]), "owner")
        a = by_id[b["signature"]]
        need(a["recovery"][1] - a["recovery"][0] >= 144, "signature opening")
    need(by_boss["boss-26220301"]["required_fruit_ignition"] is False, "fruit required")
    need(by_boss["boss-26230301"]["required_feather_break"] is False, "feather required")
    need(by_boss["boss-26230301"]["minimum_ground_casts_between_flights"] >= 2, "flight frequency")
    need(by_boss["boss-24090201"]["required_nightsoul"] is False and by_boss["boss-24090201"]["mandatory_pillars"] == 0, "device gating")
    need(by_boss["boss-22120101"]["required_void_ward"] is False and by_boss["boss-22120101"]["attrition_added"] is False, "papilla gating")
    direct = shots = air_count = 0
    for a in attacks:
        total, lock, rec = a["total"], a["lock"], a["recovery"]
        need(integer(total) and integer(lock) and interval(rec), "integer timing")
        need(0 <= lock < rec[0] < rec[1] == total, "recovery order")
        groups = a["groups"]
        need(groups and all(integer(v) and v == 1 for v in groups.values()), "group cap")
        need(a["hit_cap"] == sum(groups.values()) <= 3, "cast cap")
        need(a["element"] in {"Physical", "Pyro", "Cryo", "Electro", "Dendro", "Hydro", "Anemo", "Geo"}, "element")
        used, first, prev = set(), [], -1
        for start, end, group in a["active"]:
            need(integer(start) and integer(end) and lock <= start < end <= rec[0], "active bounds")
            need(start >= prev, "active overlap/order")
            need(group in groups, "unknown group")
            prev = end
            used.add(group)
            first.append(start)
            direct += 1
        for p in a["projectiles"]:
            spawn, ttl, group = p["spawn"], p["ttl"], p["group"]
            need(integer(spawn) and integer(ttl) and ttl > 0, "projectile timing")
            need(lock <= spawn and spawn + ttl <= rec[0], "projectile lifetime")
            need(group in groups, "projectile group")
            used.add(group)
            first.append(spawn)
            shots += 1
        need(used == set(groups) and first, "unused damage groups")
        need(min(first) - lock >= 30, "post-lock reaction budget")
        for window in a["air"]:
            need(interval(window) and lock <= window[0] and window[1] <= min(first), "air order")
            need(window[1] - window[0] <= 36, "air duration")
            air_count += 1
        for window in a.get("decorative_lobs", []):
            need(interval(window) and window[1] in first, "decorative landing")
        if a["id"].startswith("FMP"):
            need(interval(a["morph"]) and a["morph"][1] <= lock, "morph before lock")
            need(interval(a["return_morph"]) and rec[0] <= a["return_morph"][0] and a["return_morph"][1] == total, "return during recovery")
    m = data["mimic_contract"]
    for k in ("same_actor", "same_receiver", "same_hp", "preserve_aura", "preserve_dot", "preserve_target"):
        need(m[k] is True, k)
    for k in ("inherit_source_ai", "inherit_source_resistance", "spawn_new_enemy"):
        need(m[k] is False, k)
    need(m["full_invisible_ticks"] == m["invulnerable_ticks"] == 0 and m["reward_count"] == 1, "mimic concealment/rewards")
    forms = [by_id[i]["source_form"] for i in EXPECTED["boss-22120101"]]
    need(forms == ["electro_regisvine", "aeonblight_drake", "jadeplume_terroshroom"], "selected forms")
    q = data["interrupt"]
    need(q["move_id"] == "FSC03" and q["spawn_tick"] == 48 and q["acceptance"] == [60, 300], "interrupt window")
    need(q["acceptance"][1] <= by_id[q["move_id"]]["active"][0][0], "interrupt precedes attack")
    need(q["needed_distinct_casts"] == 3 and q["target_bottom_u"] <= 0.5, "interrupt target")
    for k in ("new_casts_after_window_only", "physical_allowed", "cancel_parent_reservations", "cancel_projectiles", "hp_zero_priority"):
        need(q[k] is True, k)
    for k in ("required_for_victory", "progress_carries_to_new_spawn"):
        need(q[k] is False, k)
    need(q["down_ticks"] == 180 and q["standup_ticks"] == 24 and q["rearm_ticks"] == 1200 and q["reward_count"] == 0, "interrupt lifecycle")
    return {"encounters": 4, "attack_cards": 12, "direct_windows": direct, "damaging_projectiles": shots, "short_air_intervals": air_count, "optional_interrupts": 1}

def set_path(data, path, value):
    for key in path[:-1]:
        data = data[key]
    data[path[-1]] = value

MUTATIONS = [
    ("duplicate_id", ["attacks",1,"id"], "FYM01"),
    ("wrong_owner", ["attacks",0,"owner"], "unknown"),
    ("missing_reference", ["bosses",0,"attacks",0], "UNKNOWN"),
    ("extra_pattern", ["bosses",0,"attacks"], ["FYM01","FYM02","FYM03","FYM04"]),
    ("bad_cumulative", ["counts","cumulative_attack_cards"], 108),
    ("element_gate", ["shared","required_special_element"], True),
    ("hp_scaling", ["shared","multiplayer_hp_scaling"], True),
    ("negative_lock", ["attacks",0,"lock"], -1),
    ("late_lock", ["attacks",0,"lock"], 120),
    ("overlap", ["attacks",3,"active",1,0], 100),
    ("active_in_recovery", ["attacks",0,"active",0,1], 200),
    ("lingering_projectile", ["attacks",4,"projectiles",1,"ttl"], 90),
    ("zero_ttl", ["attacks",4,"projectiles",0,"ttl"], 0),
    ("extra_hit", ["attacks",0,"hit_cap"], 2),
    ("unknown_group", ["attacks",0,"active",0,2], "new"),
    ("zero_group_cap", ["attacks",0,"groups","tail"], 0),
    ("death_order", ["shared","hp_zero_priority"], False),
    ("long_air", ["attacks",1,"air",0,0], 70),
    ("unreachable_ground", ["bosses",0,"hurtbox_bottom_u"], 1.2),
    ("mandatory_device", ["interrupt","required_for_victory"], True),
    ("short_window", ["interrupt","acceptance",1], 150),
    ("stale_parent", ["interrupt","cancel_parent_reservations"], False),
    ("aura_reset", ["mimic_contract","preserve_aura"], False),
    ("copy_boss_ai", ["mimic_contract","inherit_source_ai"], True),
]

def main():
    path = Path(__file__).with_name("MANIFEST_NATLAN_ORIGINS.json")
    raw = path.read_bytes()
    data = json.loads(raw)
    result = validate(data)
    rejected = []
    for name, keys, value in MUTATIONS:
        changed = copy.deepcopy(data)
        set_path(changed, keys, value)
        try:
            validate(changed)
        except ValueError:
            rejected.append(name)
        else:
            raise RuntimeError("validator accepted invalid fixture: " + name)
    result.update(result="PASS", rejected_mutations=len(rejected), mutation_total=len(MUTATIONS),
                  manifest_bytes=len(raw),
                  manifest_blob_sha=hashlib.sha1(b"blob " + str(len(raw)).encode() + b"\0" + raw).hexdigest(),
                  live_game="NOT RUN", collision_ai_network_visual="NOT RUN")
    print(json.dumps(result, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
