from pathlib import Path
import sys, json
from experience import RUNTIME_EXP, resolve_story_exp
ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT.parent / 'lua-limit-break-20261026-r1/work/python'))
from lupa.lua53 import LuaRuntime

def asset_entries(container):
    rows = container.items() if isinstance(container, dict) else enumerate(container, 1)
    return ((key, value, isinstance(value, (dict, list))) for key, value in rows)


def field_art(lua, prefix, poses, *, idle=None, idle_anchor=None):
    filenames = {
        pose: f'{prefix}-field-{pose.replace("_", "-")}-sprites-v1.json'
        for pose in poses
    }
    if idle:
        filenames['idle'] = idle

    def read(key):
        filename = filenames.get(key)
        if filename is None:
            return None
        asset = json.loads((ROOT / 'assets' / filename).read_text(encoding='utf8'))
        if key == 'idle' and idle_anchor is not None:
            asset['anchorX'] = idle_anchor
        return asset

    # Cache a pose on first use. The Python callbacks do not retain the Lua
    # runtime, so retiring a browser session can reclaim its asset tables.
    loader = lua.eval("""
        function(read, entries)
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
                rawset(poses, key, art)
                return art
            end})
        end
    """)
    return loader(read, asset_entries)


def runtime():
    lua = LuaRuntime(unpack_returned_tuples=True)
    core = lua.execute((ROOT / 'core.lua').read_text(encoding='utf-8'))
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
    lua.execute((ROOT / 'artifacts.lua').read_text(encoding='utf-8'))(core)
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
    graph = lua.table_from(resolve_story_exp(story_data),recursive=True)
    cave=lua.execute((ROOT/'story-cave.lua').read_text(encoding='utf8'))(core)
    roof=lua.execute((ROOT/'story-roof.lua').read_text(encoding='utf8'))(core)
    lua.execute((ROOT / 'story.lua').read_text(encoding='utf-8'))(core,graph,delivery,rail,cooking,book,stone,construction,lantern,forest,contest,sights,rest,cave,roof)
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
    assets=ROOT/'assets/sprites.json'
    if assets.exists(): core.assets=lua.table_from(json.loads(assets.read_text())['sprites'],recursive=True)
    variants=ROOT/'assets/variants.json'
    if variants.exists(): core.variants=lua.table_from({k:v['sprites'] for k,v in json.loads(variants.read_text(encoding='utf8'))['variants'].items()},recursive=True)
    lua.execute((ROOT/'boss-art.lua').read_text(encoding='utf8'))(core,*[lua.table_from(json.loads((ROOT/'assets'/name).read_text(encoding='utf8')),recursive=True) for name in ['boss-sprites.json','anemo-shell-sprites.json','anemo-core-sprites.json','farka-sprites.json']],lua.table_from([json.loads((ROOT/'assets'/f'farka-action-{i}.json').read_text(encoding='utf8')) for i in range(1,5)],recursive=True),lua.table_from(json.loads((ROOT/'assets/pyro-regisvine-sprites.json').read_text(encoding='utf8')),recursive=True),*[lua.table_from(json.loads((ROOT/'assets'/name).read_text(encoding='utf8')),recursive=True) for name in ['electro-shell-sprites.json','electro-core-sprites.json']],lua.table_from({part:json.loads((ROOT/'assets'/f'geo-{part}-sprites.json').read_text(encoding='utf8')) for part in ['shell','core','pillar']},recursive=True))
    core.primoArt=lua.table_from(json.loads((ROOT/'assets/primo-sprites.json').read_text(encoding='utf8')),recursive=True)
    core.maguuArt=lua.table_from(json.loads((ROOT/'assets/maguu-sprites.json').read_text(encoding='utf8')),recursive=True)
    character_gallery=json.loads((ROOT/'content/character-art-gallery.json').read_text(encoding='utf8'))
    companion_art={}
    for item in character_gallery['items']:
        if item['id'] in ('traveler','amber'):
            continue
        art=json.loads((ROOT/'assets'/item['file']).read_text(encoding='utf8'))
        art['height']=item['height']
        if 'leftFile' in item:
            art['left']=json.loads((ROOT/'assets'/item['leftFile']).read_text(encoding='utf8'))
        companion_art[item['id']]=art
    core.companionArt=lua.table_from(companion_art,recursive=True)
    idle_files={'right':'traveler-idle-sprites-v3.json','left':'traveler-idle-left-sprites-v1.json'}
    core.travelerIdleArt=lua.table_from({side:json.loads((ROOT/'assets'/name).read_text(encoding='utf8')) for side,name in idle_files.items()},recursive=True)
    run_cycles={}
    for side in ('left','right'):
        prefix=f'traveler-run-{side}'
        files=[f'{prefix}-sprites-v3.json',*(f'{prefix}-{phase}-sprites-v1.json' for phase in range(2,5))]
        run_cycles[side]=[json.loads((ROOT/'assets'/name).read_text(encoding='utf8')) for name in files]
    core.travelerRunArt=lua.table_from(run_cycles,recursive=True)
    core.enemySpawns=lua.table_from(json.loads((ROOT/'content/enemy-spawns.json').read_text(encoding='utf8'))['nodes'],recursive=True)
    core.hilichurlArt=lua.table_from(json.loads((ROOT/'assets/hilichurl-idle-sprites.json').read_text(encoding='utf8')),recursive=True)
    enemy_layout=json.loads((ROOT/'content/enemy-art-layout.json').read_text(encoding='utf8'))
    core.enemyArtLayout=lua.table_from(enemy_layout,recursive=True)
    core.enemyIdleArt=lua.table_from({key:json.loads((ROOT/'assets'/f'{key}-idle-sprites.json').read_text(encoding='utf8')) for key in enemy_layout},recursive=True)
    core.danukiArt=lua.table_from(json.loads((ROOT/'assets/danuki-dance-sprites-v1.json').read_text(encoding='utf8')),recursive=True)
    core.bennettArt=lua.table_from(json.loads((ROOT/'assets/bennett-cave-guide-sprites-v1.json').read_text(encoding='utf8')),recursive=True)
    core.noelleArt=lua.table_from({
        pose: json.loads((ROOT/f'assets/noelle-rest-{pose}-sprites-v1.json').read_text(encoding='utf8'))
        for pose in ('standing','seated')
    },recursive=True)
    core.amberIdleArt=lua.table_from(json.loads((ROOT/'assets/amber-idle-sprites-v3.json').read_text(encoding='utf8')),recursive=True)
    core.amberBowArt=lua.table_from(json.loads((ROOT/'assets/amber-bow-sprites-v3.json').read_text(encoding='utf8')),recursive=True)
    core.thunderArt=lua.table_from(json.loads((ROOT/'assets/thunder-sprites.json').read_text(encoding='utf8')),recursive=True)
    core.arrayArt=lua.table_from(json.loads((ROOT/'assets/array-sprites.json').read_text(encoding='utf8')),recursive=True)
    core.arrayPartArt=lua.table_from([json.loads((ROOT/'assets'/f'array-part-{i}-sprites.json').read_text(encoding='utf8')) for i in range(1,5)],recursive=True)
    core.maguuMaskArt=lua.table_from(json.loads((ROOT/'assets/maguu-mask-sprites.json').read_text(encoding='utf8')),recursive=True)
    core.maguuStanceArt=lua.table_from(json.loads((ROOT/'assets/maguu-stance-sprites.json').read_text(encoding='utf8')),recursive=True)
    core.maguuSlashArt=lua.table_from(json.loads((ROOT/'assets/maguu-slash-sprites.json').read_text(encoding='utf8')),recursive=True)
    core.oceanidArt=lua.table_from({part:json.loads((ROOT/'assets'/name).read_text(encoding='utf8')) for part,name in {'host':'oceanid-sprites.json','boar':'oceanid-boar-sprites.json','crane':'oceanid-crane-sprites.json','mallard':'oceanid-mallard-sprites.json','ferret':'oceanid-ferret-sprites.json','crab':'oceanid-crab-sprites.json','raptor':'oceanid-raptor-sprites.json','frog':'oceanid-frog-sprites.json','finch':'oceanid-finch-sprites.json'}.items()},recursive=True)
    lua.execute((ROOT/'world-bosses.lua').read_text(encoding='utf8'))(core,graph)
    field_specs=json.loads((ROOT/'content/field-boss-spawns.json').read_text(encoding='utf-8-sig'))['fieldBosses']
    jade=lua.execute((ROOT/'field-jadeplume.lua').read_text(encoding='utf-8'))(core)
    core.jadeplumeArt=field_art(lua,'jadeplume',('peck_ready','peck','crouch','spring','stagger','spores'),
                               idle='jadeplume-idle-sprites.json')
    core.cryoFieldArt=field_art(lua,'cryo',('slam_ready','slam','sweep_ready','sweep','bolts','down'),
                                idle='boss-sprites.json',idle_anchor=.54)
    core.pyroFieldArt=field_art(lua,'pyro',('raised','bowed','impact','down','bud_first','bud_second','sweep_ready','sweep'),
                                idle='pyro-regisvine-sprites.json',idle_anchor=.49)
    core.primoFieldArt=field_art(lua,'primo',('windup','claw_first','claw_second','tail_ready','tail_sweep','charge','burst','down'),
                                idle='primo-sprites.json',idle_anchor=.43)
    lua.execute((ROOT/'field-regisvine.lua').read_text(encoding='utf8'))(core)
    core.electroRegisvineFieldArt=field_art(lua,'electro-regisvine',('gather','bowed','impact','branches','rain','down'),
                                         idle='electro-regisvine-idle-sprites.json',idle_anchor=.51)
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
    core.dendroHypostasisFieldArt=field_art(lua,'dendro-hypostasis',('vine','ball','core'),
                                            idle='dendro-hypostasis-idle-sprites.json')
    asimon=lua.execute((ROOT/'field-asimon.lua').read_text(encoding='utf-8'))(core)
    core.asimonFieldArt=field_art(lua,'asimon',('ray','pillars','cloak','recover'),
                                 idle='asimon-idle-sprites.json')
    core.aeonblightFieldArt=field_art(lua,'aeonblight',('wing_first','wing_second','cannon','windup','dash','down'),
                                     idle='aeonblight-idle-sprites.json')
    bathysmal=lua.execute((ROOT/'field-bathysmal.lua').read_text(encoding='utf-8'))(core)
    core.rimebiterFieldArt=field_art(lua,'rimebiter',('tail','breath','leap'),idle='rimebiter-idle-sprites.json')
    core.bolteaterFieldArt=field_art(lua,'bolteater',('tail','breath','leap'),idle='bolteater-idle-sprites.json')
    core.ruinSerpentFieldArt=field_art(lua,'ruin-serpent',('idle','roll','dive','emerge','bombs','drill'))
    core.wolflordFieldArt=field_art(lua,'wolflord',('idle','ram','tail','jaw','recover','skull'))
    core.hydroHypostasisFieldArt=field_art(lua,'hydro-hypostasis',('dolphin','ray','rain','recover'),
                                          idle='hydro-hypostasis-idle-sprites.json')
    core.pyroHypostasisFieldArt=field_art(lua,'pyro-hypostasis',('boar','snake','fist','recover'),
                                          idle='pyro-hypostasis-idle-sprites.json')
    core.cryoHypostasisFieldArt=field_art(lua,'cryo-hypostasis',('wheel','clap','fall','recover'),
                                          idle='cryo-hypostasis-idle-sprites.json')
    core.thunderFieldArt=field_art(lua,'thunder',('wing','feathers','dash','recover'))
    core.arrayFieldArt=field_art(lua,'array',('blade','wheel','rocket','core'))
    lua.execute((ROOT/'field-bosses.lua').read_text(encoding='utf-8'))(
        core,lua.table_from(field_specs,recursive=True),
        lua.table_from({'jadeplume':jade,'cryoRegisvine':cryo_field,'pyroRegisvine':pyro_field,
                        'anemoHypostasis':anemo_field,'electroHypostasis':electro_field,'geoHypostasis':geo_field,
                        'primoGeovishap':primo_field,'oceanid':oceanid_field,'maguu':maguu_field,
                        'array':array_field,'thunder':thunder_field,'cryoHypostasis':cryo_hypostasis,
                        'pyroHypostasis':pyro_hypostasis,'hydroHypostasis':hydro_hypostasis,
                        'wolflord':wolflord_field,'ruinSerpent':ruin_serpent,'bathysmal':bathysmal,
                        'electroRegisvine':electro_vine,'aeonblight':aeonblight,
                        'dendroHypostasis':dendro_hypostasis,'asimon':asimon})
    )
    return lua, core

def native(value):
    if hasattr(value, 'items'):
        pairs = list(value.items())
        if pairs and all(isinstance(k, int) for k, _ in pairs):
            return [native(value[i]) for i in range(1, len(pairs)+1)]
        return {k: ([native(v[i]) or [] for i in range(1,len(v)+1)] if k=='loadout' else ([] if k in ('items','ground','projectiles','auras','reactions','grappleNodes','mimics') and hasattr(v,'items') and len(v)==0 else native(v))) for k, v in pairs}
    return value
