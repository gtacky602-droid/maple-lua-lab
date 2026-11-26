from pathlib import Path
import base64
import sys, json
from stygian_art import stygian_parts
from field_pose_files import enemy_pose_files, legend_pose_files
import common_boss_art as boss_parts
from packed_poses import load_pose_pack, read_packed_pose
from experience import LEVELS, RUNTIME_EXP, resolve_story_exp, resolve_stygian_exp, resolve_weekly_rewards
ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT.parent / 'lua-limit-break-20261026-r1/work/python'))
from lupa.lua53 import LuaRuntime

def asset_entries(container):
    rows = container.items() if isinstance(container, dict) else enumerate(container, 1)
    return ((key, value, isinstance(value, (dict, list))) for key, value in rows)


def field_art(lua, prefix, poses, *, idle=None, idle_anchor=None, variants=None, prepare_grid=None, packed_dir=None):
    filenames = {
        pose: f'{prefix}-field-{pose.replace("_", "-")}-sprites-v1.json'
        for pose in poses
    }
    if idle:
        filenames['idle'] = idle
    if variants:
        filenames.update(variants)

    packed = prepare_grid is not None

    def read(key):
        filename = filenames.get(key)
        if filename is None:
            return None
        if packed:
            asset = read_packed_pose(ROOT / 'assets' / packed_dir / filename)
        else:
            asset = json.loads((ROOT / 'assets' / filename).read_text(encoding='utf8'))
        if key == 'idle' and idle_anchor is not None:
            asset['anchorX'] = idle_anchor
        return asset

    # Cache a pose on first use. The Python callbacks do not retain the Lua
    # runtime, so retiring a browser session can reclaim its asset tables.
    loader = lua.eval("""
        function(read, entries, prepareGrid)
            local function copy(container)
                local result = {}
                for key, value, nested in python.iterex(entries(container)) do
                    result[key] = nested and copy(value) or value
                end
                return result
            end
            return setmetatable({}, {__index = function(poses, key)
                local data = read(key)
                if data == nil then return nil end
                local art = copy(data)
                if prepareGrid then
                    for _,grid in pairs(art.profiles) do
                        local records=grid.data
                        grid.data=nil
                        prepareGrid(grid,records)
                    end
                end
                rawset(poses, key, art)
                return art
            end})
        end
    """)
    return loader(read, asset_entries, prepare_grid)


def runtime(*, draft_balance=False, draft_field_boss_hp=True, draft_field_moves=False):
    draft_balance = draft_balance or draft_field_moves
    lua = LuaRuntime(unpack_returned_tuples=True)
    core = lua.execute((ROOT / 'core.lua').read_text(encoding='utf-8'))
    skill_settings = json.loads((ROOT / 'content/skill-runtime-settings.json').read_text(encoding='utf8'))
    core.tornadoPull = skill_settings['tornado']['pull_pixels_per_hit']
    lua.execute((ROOT / 'campaign.lua').read_text(encoding='utf-8'))(core)
    lua.execute((ROOT / 'anemo.lua').read_text(encoding='utf-8'))(core)
    lua.execute((ROOT / 'traveler-utility.lua').read_text(encoding='utf-8'))(core)
    lua.execute((ROOT / 'hydro.lua').read_text(encoding='utf-8'))(core)
    lua.execute((ROOT / 'pyro.lua').read_text(encoding='utf-8'))(core)
    lua.execute((ROOT / 'cryo.lua').read_text(encoding='utf-8'))(core)
    lua.execute((ROOT / 'fusion.lua').read_text(encoding='utf-8'))(core)
    lua.execute((ROOT / 'fusion-defense.lua').read_text(encoding='utf-8'))(core)
    lua.execute((ROOT / 'fusion-fields.lua').read_text(encoding='utf-8'))(core)
    lua.execute((ROOT / 'fusion-conditional.lua').read_text(encoding='utf-8'))(core)
    lua.execute((ROOT / 'traversal.lua').read_text(encoding='utf-8'))(core)
    lua.execute((ROOT / 'projectiles.lua').read_text(encoding='utf-8'))(core)
    lua.execute((ROOT / 'triple.lua').read_text(encoding='utf-8'))(core)
    lua.execute((ROOT / 'lunar.lua').read_text(encoding='utf-8'))(core)
    lua.execute((ROOT / 'reactions.lua').read_text(encoding='utf-8'))(core)
    lua.execute((ROOT / 'loadout.lua').read_text(encoding='utf-8'))(core)
    lua.execute((ROOT / 'progression.lua').read_text(encoding='utf-8'))(core,lua.table_from(RUNTIME_EXP,recursive=True))
    imprint=json.loads((ROOT/'content/imprint-settings.json').read_text(encoding='utf8'))
    artifact_sets=lua.table_from(json.loads((ROOT/'content/artifact-sets.json').read_text(encoding='utf8')),recursive=True)
    lua.execute((ROOT / 'artifacts.lua').read_text(encoding='utf-8'))(core,lua.table_from(imprint,recursive=True),artifact_sets)
    lua.execute((ROOT / 'companions.lua').read_text(encoding='utf-8'))(core)
    lua.execute((ROOT / 'star-seed.lua').read_text(encoding='utf-8'))(core)
    lua.execute((ROOT / 'beidou.lua').read_text(encoding='utf-8'))(core)
    lua.execute((ROOT / 'light.lua').read_text(encoding='utf-8'))(core)
    lua.execute((ROOT / 'echo.lua').read_text(encoding='utf-8'))(core)
    lua.execute((ROOT / 'ultimate.lua').read_text(encoding='utf-8'))(core)
    lua.execute((ROOT / 'ayaka.lua').read_text(encoding='utf-8'))(core)
    lua.execute((ROOT / 'emilie.lua').read_text(encoding='utf-8'))(core)
    lua.execute((ROOT / 'kachina.lua').read_text(encoding='utf-8'))(core)
    lua.execute((ROOT / 'mitya.lua').read_text(encoding='utf-8'))(core)
    delivery = lua.execute((ROOT / 'story-delivery.lua').read_text(encoding='utf-8'))
    rail = lua.execute((ROOT / 'story-rail.lua').read_text(encoding='utf-8'))
    cooking = lua.execute((ROOT / 'story-cooking.lua').read_text(encoding='utf-8'))
    book = lua.execute((ROOT / 'story-book.lua').read_text(encoding='utf-8'))
    stone = lua.execute((ROOT / 'story-stone.lua').read_text(encoding='utf-8'))
    construction = lua.execute((ROOT / 'story-construction.lua').read_text(encoding='utf-8'))(rail.drawCart)
    lantern = lua.execute((ROOT / 'story-lantern.lua').read_text(encoding='utf-8'))(core)
    forest = lua.execute((ROOT / 'story-forest.lua').read_text(encoding='utf-8'))(core)
    contest=lua.execute((ROOT / 'story-contest.lua').read_text(encoding='utf-8'))(core)
    sights = lua.execute((ROOT / 'story-sights.lua').read_text(encoding='utf-8'))(core)
    rest = lua.execute((ROOT / 'story-rest.lua').read_text(encoding='utf-8'))(core)
    story_data = json.loads((ROOT/'content/story-graph.json').read_text(encoding='utf8'))
    weapons = json.loads((ROOT/'content/weapon-settings.json').read_text(encoding='utf8'))
    if draft_balance:
        balance = json.loads((ROOT/'content/field-balance-draft.json').read_text(encoding='utf8'))
        for weapon in weapons['items']:
            weapon['atk'] = balance['weaponAttack'].get(weapon['id'], weapon['atk'])
    quests = {quest['id']: quest for quest in story_data['quests']}
    for weapon in weapons['items']:
        if 'quest' in weapon:
            quest = quests[weapon['quest']]
            quest['weaponReward'] = weapon['name']
            weapon['questName'] = quest['name']
    skill_catalog = json.loads((ROOT/'content/skill-catalog.json').read_text(encoding='utf8'))
    story_data['regionalSkills'] = {
        skill['id']: {'level': skill['unlock_level'], 'elements': skill['elements']}
        for skill in skill_catalog['skills']
        if skill['owner'] == 'traveler' and skill.get('category') in ('単独', '二元素', '三元素')
    }
    field_specs=json.loads((ROOT/'content/field-boss-spawns.json').read_text(encoding='utf-8-sig'))['fieldBosses']
    if draft_balance and draft_field_boss_hp:
        proportional_hp = {
            'driftingSnow': ('coffin', ('heal',)),
            'immortalConstruct': ('life', ('cost', 'healOnHit', 'healBudget')),
            'knuckleDuck': ('ward', ('unitHp',)),
            'whispererNightmares': ('ward', ('max', 'unitHp')),
        }
        for spec in field_specs:
            draft_hp = balance['fieldBossHp'].get(spec['id'])
            if draft_hp is None:
                continue
            spec['baseHp'] = spec['hp']
            spec['hp'] = draft_hp
            ratio = draft_hp / spec['baseHp']
            scaled = proportional_hp.get(spec['controller'])
            if scaled:
                key, fields = scaled
                for field in fields:
                    spec[key][field] = round(spec[key][field] * ratio)
    if draft_field_moves:
        for spec in field_specs:
            overrides = balance['fieldBossMoveOverrides'].get(spec['id'])
            if overrides is None:
                continue
            spec['draftMoves'] = True
            cooling = spec.get('coolingMove')
            if cooling and cooling['id'] in overrides:
                spec['moves'].append(spec.pop('coolingMove'))
            for move in spec['moves']:
                move.update(overrides.get(move['id'], {}))
    weekly_specs=resolve_weekly_rewards(json.loads((ROOT/'content/weekly-boss-spawns.json').read_text(encoding='utf8'))['weeklyBosses'])
    if draft_balance:
        for spec in weekly_specs:
            hp_by_mode = balance['weeklyBossHp'].get(spec['id'], {})
            for mode in spec.get('modes', ()):
                if mode['id'] in hp_by_mode:
                    mode['draftHp'] = hp_by_mode[mode['id']]
    story_data['bossNodes']={
        target:spec['node'] for spec in field_specs+weekly_specs
        for target in (spec['id'],spec.get('storyChallenge')) if target}
    stygian=resolve_stygian_exp(json.loads((ROOT/'content/stygian-matches.json').read_text(encoding='utf8'))['matches'])
    if draft_balance:
        for match, hp_by_mode in balance['stygianBossHp'].items():
            for mode in stygian[match]['modes']:
                if mode['id'] in hp_by_mode:
                    mode['hp'] = hp_by_mode[mode['id']]
                    mode['draftHp'] = True
    stygian_timing=json.loads((ROOT/'docs/stygian-motion-v1/MANIFEST.json').read_text(encoding='utf8'))
    for scripted_match in ('farka','rerir','ronova'):
        stygian[scripted_match]['cards']={
            card['id']: card | {'variants':{variant['name']:variant for variant in card.get('variants',[])}}
            for card in stygian_timing['entries'] if card['boss']==scripted_match
        }
    story_data['bossNodes'].update({spec['challenge']:spec['node'] for spec in stygian.values()})
    graph = lua.table_from(resolve_story_exp(story_data),recursive=True)
    cave=lua.execute((ROOT/'story-cave.lua').read_text(encoding='utf8'))(core)
    roof=lua.execute((ROOT/'story-roof.lua').read_text(encoding='utf8'))(core)
    reflection=lua.execute((ROOT/'story-reflection.lua').read_text(encoding='utf8'))(core)
    local_light=lua.execute((ROOT/'story-local-light.lua').read_text(encoding='utf8'))()
    airflow=lua.execute((ROOT/'story-airflow.lua').read_text(encoding='utf8'))()
    resonance=lua.execute((ROOT/'story-resonance.lua').read_text(encoding='utf8'))
    rock_views=lua.execute((ROOT/'story-rock-views.lua').read_text(encoding='utf8'))
    paper_folds=lua.execute((ROOT/'story-paper-folds.lua').read_text(encoding='utf8'))
    theater=lua.execute((ROOT/'story-theater.lua').read_text(encoding='utf8'))(core)
    flag_course=lua.execute((ROOT/'story-flag-course.lua').read_text(encoding='utf8'))(core)
    moving_platforms=lua.execute((ROOT/'story-moving-platforms.lua').read_text(encoding='utf8'))(core)
    duel=lua.execute((ROOT/'story-sunset-duel.lua').read_text(encoding='utf8'))(core)
    moon_inlet=lua.execute((ROOT/'story-moon-inlet.lua').read_text(encoding='utf8'))()
    coast_detour=lua.execute((ROOT/'story-coast-detour.lua').read_text(encoding='utf8'))(core)
    prepare_grid=lua.execute((ROOT/'packed-poses.lua').read_text(encoding='utf8'))
    alias=lua.eval("""function(store,files)
        return setmetatable({}, {__index=function(view,key)
            local file=files[key]
            if file then
                local pose=store[file]
                rawset(view,key,pose)
                return pose
            end
        end})
    end""")
    core.teaCluePictures=lua.table_from(json.loads((ROOT/'content/tea-clue-pictures.json').read_bytes()),recursive=True)
    quest_files=json.loads((ROOT/'content/quest-pose-files.json').read_bytes())
    filenames={filename for group in quest_files.values()
               for filename in ([group] if isinstance(group,str) else group.values())}
    quest_poses=field_art(lua,'',(),variants={name:name for name in filenames},
                          prepare_grid=prepare_grid,packed_dir='quest-packed')
    single=lua.eval("""function(store,file)
        return setmetatable({},{
            __index=function(_,key) return store[file][key] end,
            __pairs=function() return pairs(store[file]) end
        })
    end""")
    for key,group in quest_files.items():
        core[key]=single(quest_poses,group) if isinstance(group,str) else alias(quest_poses,lua.table_from(group))
    appraisal=lua.execute((ROOT/'story-appraisal.lua').read_text(encoding='utf8'))
    rumor=lua.execute((ROOT/'story-rumor.lua').read_text(encoding='utf8'))
    bloom=lua.execute((ROOT/'story-bloom.lua').read_text(encoding='utf8'))
    patrol=lua.execute((ROOT/'story-patrol.lua').read_text(encoding='utf8'))
    survey_rig=lua.execute((ROOT/'story-survey-rig.lua').read_text(encoding='utf8'))
    snow_match=lua.execute((ROOT/'story-snow-match.lua').read_text(encoding='utf8'))
    return_box=lua.execute((ROOT/'story-return-box.lua').read_text(encoding='utf8'))
    night_banner=lua.execute((ROOT/'story-night-banner.lua').read_text(encoding='utf8'))
    fireworks=lua.execute((ROOT/'story-fireworks.lua').read_text(encoding='utf8'))
    stealth=lua.execute((ROOT/'story-stealth.lua').read_text(encoding='utf8'))
    itto_games=lua.execute((ROOT/'story-itto-games.lua').read_text(encoding='utf8'))
    tea_case=lua.execute((ROOT/'story-tea-case.lua').read_text(encoding='utf8'))
    wanderer_survey=lua.execute((ROOT/'story-wanderer-survey.lua').read_text(encoding='utf8'))
    observation_visitors=lua.execute((ROOT/'story-observation-visitors.lua').read_text(encoding='utf8'))
    collei_guide=lua.execute((ROOT/'story-collei-guide.lua').read_text(encoding='utf8'))
    kaveh_model=lua.execute((ROOT/'story-kaveh-model.lua').read_text(encoding='utf8'))
    nahida_map=lua.execute((ROOT/'story-discovery-map.lua').read_text(encoding='utf8'))
    emilie_scent=lua.execute((ROOT/'story-emilie-scent.lua').read_text(encoding='utf8'))
    furina_cues=lua.execute((ROOT/'story-furina-cues.lua').read_text(encoding='utf8'))
    navia_photo=lua.execute((ROOT/'story-navia-photo.lua').read_text(encoding='utf8'))
    lyney_magic=lua.execute((ROOT/'story-lyney-magic.lua').read_text(encoding='utf8'))
    freminet_dive=lua.execute((ROOT/'story-freminet-dive.lua').read_text(encoding='utf8'))
    stone_ornaments=lua.execute((ROOT/'story-stone-ornaments.lua').read_text(encoding='utf8'))
    mualani_surf=lua.execute((ROOT/'story-mualani-surf.lua').read_text(encoding='utf8'))
    kinich_ambush=lua.execute((ROOT/'story-kinich-ambush.lua').read_text(encoding='utf8'))
    xilonen_springs=lua.execute((ROOT/'story-xilonen-springs.lua').read_text(encoding='utf8'))
    iansan_training=lua.execute((ROOT/'story-iansan-training.lua').read_text(encoding='utf8'))
    lua.execute((ROOT / 'story.lua').read_text(encoding='utf-8'))(core,graph,delivery,rail,cooking,book,stone,construction,lantern,forest,contest,sights,rest,cave,roof,reflection,local_light,airflow,resonance,rock_views,paper_folds,theater,flag_course,moving_platforms,duel,moon_inlet,coast_detour,appraisal,rumor,bloom,patrol,survey_rig,snow_match,return_box,night_banner,fireworks,stealth,itto_games,tea_case,wanderer_survey,observation_visitors,collei_guide,kaveh_model,nahida_map,emilie_scent,furina_cues,navia_photo,lyney_magic,freminet_dive,stone_ornaments,mualani_surf,kinich_ambush,xilonen_springs,iansan_training)
    lua.execute((ROOT / 'barrier.lua').read_text(encoding='utf-8'))(core)
    lua.execute((ROOT / 'farka.lua').read_text(encoding='utf-8'))(core)
    lua.execute((ROOT / 'regisvine.lua').read_text(encoding='utf-8'))(core)
    lua.execute((ROOT/'pyro-regisvine.lua').read_text(encoding='utf8'))(core)
    lua.execute((ROOT/'electro-hypostasis.lua').read_text(encoding='utf8'))(core)
    lua.execute((ROOT/'geo-hypostasis.lua').read_text(encoding='utf8'))(core)
    lua.execute((ROOT/'oceanid.lua').read_text(encoding='utf8'))(core)
    lua.execute((ROOT/'primo-geovishap.lua').read_text(encoding='utf8'))(core)
    lua.execute((ROOT/'maguu-kenki.lua').read_text(encoding='utf8'))(core)
    lua.execute((ROOT/'mechanical-array.lua').read_text(encoding='utf8'))(core)
    lua.execute((ROOT/'array-sentinels.lua').read_text(encoding='utf8'))(core)
    lua.execute((ROOT/'thunder-manifestation.lua').read_text(encoding='utf8'))(core)
    core.variants=lua.table()
    for path in sorted((ROOT/'assets/base-packed').glob('*.json')):
        sprites=lua.table()
        for index,grid in enumerate(json.loads(path.read_bytes())['sprites'],1):
            records=base64.b64decode(grid.pop('data'),validate=True)
            sprites[index]=prepare_grid(lua.table_from(grid,recursive=True),records)
        core.variants[path.stem]=sprites
    core.assets=core.variants.legacy
    shared=load_pose_pack(lua,ROOT,'common-boss-packed.json')
    lua.execute((ROOT/'boss-art.lua').read_text(encoding='utf8'))(
        core,*(shared[name] for name in boss_parts.BASE),
        lua.table_from([shared[name] for name in boss_parts.FARKA_ACTIONS]),shared[boss_parts.PYRO],
        *(shared[name] for name in boss_parts.ELECTRO),
        lua.table_from({key:shared[name] for key,name in boss_parts.GEO.items()}))
    for key,name in boss_parts.CORE.items():
        core[key]=shared[name]
    core.arrayPartArt=lua.table_from([shared[name] for name in boss_parts.ARRAY_PARTS])
    character_gallery=json.loads((ROOT/'content/character-art-gallery.json').read_text(encoding='utf8'))
    poses=load_pose_pack(lua,ROOT,'character-gallery-packed.json')
    companion_art=lua.table()
    for item in character_gallery['items']:
        art=poses[item['file']]
        left=poses[item['leftFile']] if 'leftFile' in item else None
        if item['id']=='traveler':
            core.travelerIdleArt=lua.table(right=art,left=left)
        elif item['id']=='amber':
            core.amberIdleArt=art
        else:
            art.height=item['height']
            art.left=left
            companion_art[item['id']]=art
    core.companionArt=companion_art
    motion=json.loads((ROOT/'content/motion-pose-files.json').read_bytes())
    filenames={file for parts in motion.values() for file in parts.values()}
    motion_poses=field_art(lua,'',(),variants={name:name for name in filenames},
                           prepare_grid=prepare_grid,packed_dir='motion-packed')
    core.travelerRunArt=lua.table()
    for side in ('left','right'):
        frames=motion[side]
        core.travelerRunArt[side]=lua.table_from([single(motion_poses,frames[str(i)]) for i in range(1,len(frames)+1)])
    core.amberBowArt=single(motion_poses,motion['amber']['bow'])
    core.oceanidArt=alias(motion_poses,lua.table_from(motion['oceanid']))
    core.enemySpawns=lua.table_from(json.loads((ROOT/'content/enemy-spawns.json').read_text(encoding='utf8'))['nodes'],recursive=True)
    enemy_layout=json.loads((ROOT/'content/enemy-art-layout.json').read_text(encoding='utf8'))
    core.enemyArtLayout=lua.table_from(enemy_layout,recursive=True)
    enemy_files=enemy_pose_files(enemy_layout)
    legend_files=legend_pose_files(field_specs)
    filenames=set(enemy_files.values()).union(*(poses.values() for poses in legend_files.values()))
    field_poses=field_art(lua,'',(),variants={name:name for name in filenames},
                          prepare_grid=prepare_grid,packed_dir='field-packed')
    core.enemyIdleArt=alias(field_poses,lua.table_from(enemy_files))
    core.hilichurlArt=core.enemyIdleArt['hilichurl']
    core.danukiArt=companion_art['bake-danuki']
    lua.execute((ROOT/'world-bosses.lua').read_text(encoding='utf8'))(core,graph)
    story_nodes={node['id']:node for node in story_data['nodes']}
    for spec in field_specs:
        cover=[platform for platform in story_nodes[spec['node']]['platforms'] if platform.get('cover')]
        if cover:
            spec['cover']=cover
    jade=lua.execute((ROOT/'field-jadeplume.lua').read_text(encoding='utf-8'))(core)
    field_boss_files=json.loads((ROOT/'content/field-boss-pose-files.json').read_bytes())
    for key,spec in field_boss_files.items():
        core[key]=field_art(lua,'',(),variants=spec['poses'],idle_anchor=spec.get('idleAnchor'),
                            prepare_grid=prepare_grid,packed_dir='field-boss-packed')
    lua.execute((ROOT/'field-regisvine.lua').read_text(encoding='utf8'))(core)
    electro_vine=lua.execute((ROOT/'field-electro-regisvine.lua').read_text(encoding='utf-8'))(core)
    cryo_field=lua.execute((ROOT/'field-cryo-regisvine.lua').read_text(encoding='utf8'))(core)
    pyro_field=lua.execute((ROOT/'field-pyro-regisvine.lua').read_text(encoding='utf8'))(core)
    anemo_field=lua.execute((ROOT/'field-anemo-hypostasis.lua').read_text(encoding='utf-8'))(core)
    electro_field=lua.execute((ROOT/'field-electro-hypostasis.lua').read_text(encoding='utf-8'))(core)
    geo_field=lua.execute((ROOT/'field-geo-hypostasis.lua').read_text(encoding='utf-8'))(core)
    primo_field=lua.execute((ROOT/'field-primo-geovishap.lua').read_text(encoding='utf-8'))(core)
    oceanid_field=lua.execute((ROOT/'field-oceanid.lua').read_text(encoding='utf-8'))(core)
    maguu_field=lua.execute((ROOT/'field-maguu.lua').read_text(encoding='utf-8'))(core)
    array_field=lua.execute((ROOT/'field-array.lua').read_text(encoding='utf-8'))(core)
    thunder_field=lua.execute((ROOT/'field-thunder.lua').read_text(encoding='utf-8'))(core)
    cryo_hypostasis=lua.execute((ROOT/'field-cryo-hypostasis.lua').read_text(encoding='utf-8'))(core)
    pyro_hypostasis=lua.execute((ROOT/'field-pyro-hypostasis.lua').read_text(encoding='utf-8'))(core)
    hydro_hypostasis=lua.execute((ROOT/'field-hydro-hypostasis.lua').read_text(encoding='utf-8'))(core)
    wolflord_field=lua.execute((ROOT/'field-wolflord.lua').read_text(encoding='utf-8'))(core)
    ruin_serpent=lua.execute((ROOT/'field-ruin-serpent.lua').read_text(encoding='utf-8'))(core)
    aeonblight=lua.execute((ROOT/'field-aeonblight.lua').read_text(encoding='utf-8'))(core)
    dendro_hypostasis=lua.execute((ROOT/'field-dendro-hypostasis.lua').read_text(encoding='utf-8'))(core)
    asimon=lua.execute((ROOT/'field-asimon.lua').read_text(encoding='utf-8'))(core)
    wenut=lua.execute((ROOT/'field-wenut.lua').read_text(encoding='utf-8'))(core)
    baptist=lua.execute((ROOT/'field-baptist.lua').read_text(encoding='utf-8'))(core)
    emperor=lua.execute((ROOT/'field-emperor.lua').read_text(encoding='utf-8'))(core)
    seahorse=lua.execute((ROOT/'field-seahorse.lua').read_text(encoding='utf-8'))(core)
    generator=lua.execute((ROOT/'field-generator.lua').read_text(encoding='utf-8'))(core)
    tulpa=lua.execute((ROOT/'field-tulpa.lua').read_text(encoding='utf-8'))(core)
    icewind=lua.execute((ROOT/'field-icewind.lua').read_text(encoding='utf-8'))(core)
    legatus=lua.execute((ROOT/'field-legatus.lua').read_text(encoding='utf-8'))(core)
    suanni=lua.execute((ROOT/'field-suanni.lua').read_text(encoding='utf-8'))(core)
    qucusaur=lua.execute((ROOT/'field-qucusaur.lua').read_text(encoding='utf-8'))(core)
    yumka=lua.execute((ROOT/'field-yumka.lua').read_text(encoding='utf-8'))(core)
    config_device=lua.execute((ROOT/'field-config-device.lua').read_text(encoding='utf-8'))(core)
    papilla=lua.execute((ROOT/'field-papilla.lua').read_text(encoding='utf-8'))(core)
    lava_dragon=lua.execute((ROOT/'field-lava-dragon.lua').read_text(encoding='utf-8'))(core)
    overseer=lua.execute((ROOT/'field-overseer.lua').read_text(encoding='utf-8'))(core)
    knuckle_duck=lua.execute((ROOT/'field-knuckle-duckle.lua').read_text(encoding='utf-8'))(core)
    battleship=lua.execute((ROOT/'field-battleship.lua').read_text(encoding='utf-8'))(core)
    frostnight_herra=lua.execute((ROOT/'field-frostnight-herra.lua').read_text(encoding='utf-8'))(core)
    whisperer_nightmares=lua.execute((ROOT/'field-whisperer-nightmares.lua').read_text(encoding='utf-8'))(core)
    lua.execute((ROOT/'radiant-cocoon.lua').read_text(encoding='utf-8'))(core)
    moonfly=lua.execute((ROOT/'field-moonfly.lua').read_text(encoding='utf-8'))(core)
    moongecko=lua.execute((ROOT/'field-moongecko.lua').read_text(encoding='utf-8'))(core)
    spiritspeaker=lua.execute((ROOT/'field-spiritspeaker.lua').read_text(encoding='utf-8'))(core)
    fallen_vigil=lua.execute((ROOT/'field-fallen-vigil.lua').read_text(encoding='utf-8'))(core)
    flugel=lua.execute((ROOT/'field-flugel.lua').read_text(encoding='utf-8'))(core)
    drifting_snow=lua.execute((ROOT/'field-drifting-snow.lua').read_text(encoding='utf-8'))(core)
    immortal_construct=lua.execute((ROOT/'field-immortal-construct.lua').read_text(encoding='utf-8'))(core)
    wavebinder=lua.execute((ROOT/'field-wavebinder.lua').read_text(encoding='utf-8'))(core)
    bathysmal=lua.execute((ROOT/'field-bathysmal.lua').read_text(encoding='utf-8'))(core)
    snow_sweeper=lua.execute((ROOT/'field-snow-sweeper.lua').read_text(encoding='utf8'))(core)
    frost_antler=lua.execute((ROOT/'field-frost-antler.lua').read_text(encoding='utf8'))(core)
    windward_tower=lua.execute((ROOT/'field-windward-tower.lua').read_text(encoding='utf8'))(core)
    rubble_sifter=lua.execute((ROOT/'field-rubble-sifter.lua').read_text(encoding='utf8'))(core)
    prism_walker=lua.execute((ROOT/'field-prism-walker.lua').read_text(encoding='utf8'))(core)
    ice_crawler=lua.execute((ROOT/'field-ice-crawler.lua').read_text(encoding='utf8'))(core)
    rime_hare=lua.execute((ROOT/'field-rime-hare.lua').read_text(encoding='utf8'))(core)
    tea_boulder=lua.execute((ROOT/'field-tea-boulder.lua').read_text(encoding='utf8'))(core)
    plate_tail=lua.execute((ROOT/'field-plate-tail.lua').read_text(encoding='utf8'))(core)
    field_display=lua.execute((ROOT/'field-display.lua').read_text(encoding='utf8'))
    ruin_guardian=lua.execute((ROOT/'field-ruin-guardian.lua').read_text(encoding='utf8'))
    wind_ring=ruin_guardian(core,core.windRingFieldArt)
    bell_gate=ruin_guardian(core,core.bellGateFieldArt)
    canopy_fungus=ruin_guardian(core,core.canopyFungusFieldArt)
    river_racer=field_display(core,core.riverRacerFieldArt)
    river_racer.damageFactor=duel.damageFactor
    river_racer.storyDriven=True
    river_racer.adoptCoop=duel.adoptCoop
    river_racer.stepCoop=duel.stepCoop
    river_racer.finishPractice=duel.finishPractice
    moon_crab=lua.execute((ROOT/'field-moon-crab.lua').read_text(encoding='utf8'))(core)
    branch_legend=lua.execute((ROOT/'field-branch-legend.lua').read_text(encoding='utf-8'))(core)
    water_legend=lua.execute((ROOT/'field-water-legend.lua').read_text(encoding='utf-8'))(core)
    core.branchLegendArt=lua.table_from({
        name: alias(field_poses,lua.table_from(poses)) for name,poses in legend_files.items()
    })

    lua.execute((ROOT/'field-bosses.lua').read_text(encoding='utf-8'))(
        core,lua.table_from(field_specs,recursive=True),
        lua.table_from({'snowSweeper':snow_sweeper,'frostAntler':frost_antler,'windwardTower':windward_tower,
                        'rubbleSifter':rubble_sifter,'prismWalker':prism_walker,'iceCrawler':ice_crawler,'rimeHare':rime_hare,
                        'teaBoulder':tea_boulder,'plateTail':plate_tail,'windRing':wind_ring,'bellGate':bell_gate,
                        'canopyFungus':canopy_fungus,'grandFinale':ruin_guardian(core,core.grandFinaleArt),'riverRacer':river_racer,
                        'moonCrab':moon_crab,'branchLegend':branch_legend,'waterLegend':water_legend,
                        'jadeplume':jade,'cryoRegisvine':cryo_field,'pyroRegisvine':pyro_field,
                        'anemoHypostasis':anemo_field,'electroHypostasis':electro_field,'geoHypostasis':geo_field,
                        'primoGeovishap':primo_field,'oceanid':oceanid_field,'maguu':maguu_field,
                        'array':array_field,'thunder':thunder_field,'cryoHypostasis':cryo_hypostasis,
                        'pyroHypostasis':pyro_hypostasis,'hydroHypostasis':hydro_hypostasis,
                        'wolflord':wolflord_field,'ruinSerpent':ruin_serpent,'bathysmal':bathysmal,
                        'electroRegisvine':electro_vine,'aeonblight':aeonblight,
                        'dendroHypostasis':dendro_hypostasis,'asimon':asimon,'wenut':wenut,'baptist':baptist,
                        'emperor':emperor,'seahorse':seahorse,'generator':generator,'tulpa':tulpa,
                        'icewind':icewind,'legatus':legatus,'suanni':suanni,'qucusaur':qucusaur,'yumka':yumka,
                        'configDevice':config_device,'papilla':papilla,'lavaDragon':lava_dragon,'overseer':overseer,
                        'knuckleDuck':knuckle_duck,'battleship':battleship,'frostnightHerra':frostnight_herra,
                        'whispererNightmares':whisperer_nightmares,'moonfly':moonfly,'moongecko':moongecko,'spiritspeaker':spiritspeaker,'fallenVigil':fallen_vigil,'flugel':flugel,'driftingSnow':drifting_snow,'immortalConstruct':immortal_construct,'wavebinder':wavebinder})
    )
    weekly_files=json.loads((ROOT/'content/weekly-pose-files.json').read_bytes())
    for key,files in weekly_files.items():
        core[key]=field_art(lua,'',(),variants=files,prepare_grid=prepare_grid,packed_dir='weekly-packed')
    dvalin=lua.execute((ROOT/'weekly-dvalin.lua').read_text(encoding='utf-8'))(core)
    andrius=lua.execute((ROOT/'weekly-andrius.lua').read_text(encoding='utf8'))(core)
    surveyor=lua.execute((ROOT/'weekly-surveyor.lua').read_text(encoding='utf8'))(core)
    loom=lua.execute((ROOT/'weekly-loom.lua').read_text(encoding='utf8'))(core)
    childe=lua.execute((ROOT/'weekly-childe.lua').read_text(encoding='utf8'))(core)
    azhdaha=lua.execute((ROOT/'weekly-azhdaha.lua').read_text(encoding='utf8'))(core)
    signora=lua.execute((ROOT/'weekly-signora.lua').read_text(encoding='utf8'))(core)
    raiden=lua.execute((ROOT/'weekly-raiden.lua').read_text(encoding='utf8'))(core)
    shouki=lua.execute((ROOT/'weekly-shouki.lua').read_text(encoding='utf8'))(core)
    apep_defense=lua.execute((ROOT/'weekly-apep-defense.lua').read_text(encoding='utf8'))(core)
    apep=lua.execute((ROOT/'weekly-apep.lua').read_text(encoding='utf8'))(core,apep_defense)
    narwhal=lua.execute((ROOT/'weekly-narwhal.lua').read_text(encoding='utf8'))(core)
    knave=lua.execute((ROOT/'weekly-knave.lua').read_text(encoding='utf8'))(core)
    primal_fire=lua.execute((ROOT/'weekly-primal-fire.lua').read_text(encoding='utf8'))(core)
    gate_moves=lua.execute((ROOT/'weekly-gate-moves.lua').read_text(encoding='utf8'))(core)
    gate=lua.execute((ROOT/'weekly-gate.lua').read_text(encoding='utf8'))(core,gate_moves)
    false_moon_moves=lua.execute((ROOT/'weekly-false-moon-attacks.lua').read_text(encoding='utf8'))(core)
    false_moon=lua.execute((ROOT/'weekly-false-moon.lua').read_text(encoding='utf8'))(core,false_moon_moves)
    heretic_moves=lua.execute((ROOT/'weekly-heretic-attacks.lua').read_text(encoding='utf8'))(core)
    heretic=lua.execute((ROOT/'weekly-heretic.lua').read_text(encoding='utf8'))(core,heretic_moves)
    lua.execute((ROOT/'weekly-bosses.lua').read_text(encoding='utf8'))(
        core,lua.table_from(weekly_specs,recursive=True),
        lua.table_from({'dvalin':dvalin,'andrius':andrius,'surveyor':surveyor,'loom':loom,
                        'childe':childe,'azhdaha':azhdaha,'signora':signora,'raiden':raiden,'shouki':shouki,
                        'apep':apep,'narwhal':narwhal,'knave':knave,'primal_fire':primal_fire,'game_before_gate':gate,
                        'false_moon':false_moon,'heretic':heretic}))
    core.installToyDiveGuard()
    daily=json.loads((ROOT/'content/daily-quests.json').read_text(encoding='utf8'))
    lua.execute((ROOT/'daily-quests.lua').read_text(encoding='utf8'))(core,lua.table_from(daily,recursive=True),graph)
    abyss=json.loads((ROOT/'content/abyss-settings.json').read_text(encoding='utf8'))
    if not draft_balance:
        abyss['modes'] = {id: mode for id, mode in abyss['modes'].items() if not mode.get('draft')}
    def stygian_layers(parts):
        files={key:file for key,file in parts.items() if isinstance(file,str)}
        layers=field_art(lua,'',(),variants=files,prepare_grid=prepare_grid,packed_dir='stygian-packed')
        for key,subparts in parts.items():
            if isinstance(subparts,dict):
                layers[key]=stygian_layers(subparts)
        return layers

    for name,parts in stygian_parts(ROOT).items():
        core['stygian'+name+'Art']=stygian_layers(parts)
    core.stygianWandererArt=lua.table(left=companion_art.wanderer.left,right=companion_art.wanderer)
    core.stygianBeidouArt.idle=lua.table(left=companion_art.beidou.left,right=companion_art.beidou)
    for name in ('Capitano','Xbalanque'):
        sockets=json.loads((ROOT/f'assets/{name.lower()}-stygian-generation-v1.json').read_bytes())['hand_sockets']
        core['stygian'+name+'Art'].hands=lua.table_from(sockets,recursive=True)
    stygian_geometry=lua.execute((ROOT/'stygian-geometry.lua').read_text(encoding='utf8'))
    stygian_beidou=lua.execute((ROOT/'stygian-beidou.lua').read_text(encoding='utf8'))(core,stygian_geometry)
    capitano_moves=lua.execute((ROOT/'stygian-capitano-moves.lua').read_text(encoding='utf8'))(core,stygian_geometry)
    capitano=lua.execute((ROOT/'stygian-capitano.lua').read_text(encoding='utf8'))(core,capitano_moves)
    xbalanque_moves=lua.execute((ROOT/'stygian-xbalanque-moves.lua').read_text(encoding='utf8'))(core,stygian_geometry)
    xbalanque=lua.execute((ROOT/'stygian-xbalanque.lua').read_text(encoding='utf8'))(core,stygian_geometry,xbalanque_moves)
    rerir_moves=lua.execute((ROOT/'stygian-rerir-moves.lua').read_text(encoding='utf8'))(core,stygian_geometry)
    rerir_view=lua.execute((ROOT/'stygian-rerir-view.lua').read_text(encoding='utf8'))(core,stygian_geometry,rerir_moves)
    rerir=lua.execute((ROOT/'stygian-rerir.lua').read_text(encoding='utf8'))(core,stygian_geometry,rerir_moves,rerir_view)
    ronova_party=lua.execute((ROOT/'stygian-ronova-party.lua').read_text(encoding='utf8'))(core)
    ronova_moves=lua.execute((ROOT/'stygian-ronova-moves.lua').read_text(encoding='utf8'))(core,stygian_geometry,ronova_party)
    ronova_view=lua.execute((ROOT/'stygian-ronova-view.lua').read_text(encoding='utf8'))(core,stygian_geometry,ronova_moves)
    ronova=lua.execute((ROOT/'stygian-ronova.lua').read_text(encoding='utf8'))(core,stygian_geometry,ronova_party,ronova_moves,ronova_view)
    wanderer_moves=lua.execute((ROOT/'stygian-wanderer-moves.lua').read_text(encoding='utf8'))(core,stygian_geometry)
    wanderer_view=lua.execute((ROOT/'stygian-wanderer-view.lua').read_text(encoding='utf8'))(core,stygian_geometry,wanderer_moves)
    wanderer=lua.execute((ROOT/'stygian-wanderer.lua').read_text(encoding='utf8'))(core,stygian_geometry,wanderer_moves,wanderer_view)
    farka_moves=lua.execute((ROOT/'stygian-farka-moves.lua').read_text(encoding='utf8'))(core,stygian_geometry)
    farka_view=lua.execute((ROOT/'stygian-farka-view.lua').read_text(encoding='utf8'))(core,stygian_geometry,farka_moves)
    farka=lua.execute((ROOT/'stygian-farka.lua').read_text(encoding='utf8'))(core,stygian_geometry,farka_moves,farka_view)
    farka_layers=json.loads((ROOT/'content/farka-idle-layers.json').read_text(encoding='utf8'))
    farka_root=farka_layers['root']
    farka_hands={
        side:{hand:[value-root for value,root in zip(layer['sockets'][f'hand_{hand}'],farka_root)]
              for hand in ('front','back')}
        for side,layer in farka_layers['facings'].items()
    }
    core.stygianFarkaArt.hands=lua.table_from(farka_hands,recursive=True)
    lua.execute((ROOT/'endgame.lua').read_text(encoding='utf8'))(
        core,lua.table_from(abyss,recursive=True),lua.table_from(weekly_specs,recursive=True),
        lua.table_from(stygian,recursive=True),
        lua.table_from({'farka':farka,'beidou':stygian_beidou,'capitano':capitano,'xbalanque':xbalanque,
                        'rerir':rerir,'ronova':ronova,'wanderer':wanderer}))
    lua.execute((ROOT/'growth-trials.lua').read_text(encoding='utf8'))(core)
    domains = json.loads((ROOT/'content/artifact-domains.json').read_text(encoding='utf8'))
    for domain in domains['domains']:
        for rank in domain['ranks']:
            rank['waves'] = [[key for key, count in wave.items() for _ in range(count)] for wave in rank['waves']]
            rank['count'] = sum(len(wave) for wave in rank['waves'])
            rank['xp'] = LEVELS[rank['level'] - 1]['normal_enemy_base_exp'] * rank['xpUnits']
    lua.execute((ROOT/'artifact-domains.lua').read_text(encoding='utf8'))(
        core,lua.table_from(domains,recursive=True),artifact_sets)
    atlas = json.loads((ROOT/'content/world-atlas.json').read_text(encoding='utf8'))
    lua.execute((ROOT/'world-atlas.lua').read_text(encoding='utf8'))(core,lua.table_from(atlas,recursive=True))
    coop = json.loads((ROOT/'content/coop-preview.json').read_text(encoding='utf8'))
    lua.execute((ROOT/'coop.lua').read_text(encoding='utf8'))(core,lua.table_from(coop,recursive=True))
    lua.execute((ROOT/'weapons.lua').read_text(encoding='utf8'))(core,lua.table_from(weapons,recursive=True))
    if draft_balance:
        lua.execute((ROOT/'field-balance.lua').read_text(encoding='utf8'))(core,lua.table_from(balance,recursive=True))
    lua.execute((ROOT/'party-checkpoint.lua').read_text(encoding='utf8'))(core)
    lua.execute((ROOT/'party-presets.lua').read_text(encoding='utf8'))(core)
    return lua, core

def native(value):
    if hasattr(value, 'items'):
        pairs = list(value.items())
        if pairs and all(isinstance(k, int) for k, _ in pairs):
            return [native(value[i]) for i in range(1, len(pairs)+1)]
        return {k: ([native(v[i]) or [] for i in range(1,len(v)+1)] if k=='loadout' else ([] if k in ('items','ground','projectiles','auras','reactions','grappleNodes','mimics','activeSlots','carrySlots','dailyChoices') and hasattr(v,'items') and len(v)==0 else native(v))) for k, v in pairs}
    return value
