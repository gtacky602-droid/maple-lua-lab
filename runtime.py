from pathlib import Path
import sys, json
from experience import RUNTIME_EXP, resolve_story_exp
ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT.parent / 'lua-limit-break-20261026-r1/work/python'))
from lupa.lua53 import LuaRuntime

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
    jade_art={'idle':'jadeplume-idle-sprites.json'}
    for pose in ('peck_ready','peck','crouch','spring','stagger','spores'):
        jade_art[pose]="jadeplume-field-"+pose.replace('_','-')+"-sprites-v1.json"
    core.jadeplumeArt=lua.table_from({
        pose:json.loads((ROOT/'assets'/filename).read_text(encoding='utf8')) for pose,filename in jade_art.items()
    },recursive=True)
    def regisvine_art(prefix,idle,anchor,poses):
        art={
            pose: json.loads((ROOT/'assets'/f'{prefix}-field-{pose.replace("_","-")}-sprites-v1.json').read_text(encoding='utf8'))
            for pose in poses
        }
        art['idle']=json.loads((ROOT/'assets'/idle).read_text(encoding='utf8'))
        art['idle']['anchorX']=anchor
        return lua.table_from(art,recursive=True)

    core.cryoFieldArt=regisvine_art('cryo','boss-sprites.json',0.54,('slam_ready','slam','sweep_ready','sweep','bolts','down'))
    core.pyroFieldArt=regisvine_art('pyro','pyro-regisvine-sprites.json',0.49,
                                   ('raised','bowed','impact','down','bud_first','bud_second','sweep_ready','sweep'))
    lua.execute((ROOT/'field-regisvine.lua').read_text(encoding='utf8'))(core)
    cryo_field=lua.execute((ROOT/'field-cryo-regisvine.lua').read_text(encoding='utf8'))(core)
    pyro_field=lua.execute((ROOT/'field-pyro-regisvine.lua').read_text(encoding='utf8'))(core)
    anemo_field=lua.execute((ROOT/'field-anemo-hypostasis.lua').read_text(encoding='utf-8'))(core)
    electro_field=lua.execute((ROOT/'field-electro-hypostasis.lua').read_text(encoding='utf-8'))(core)
    lua.execute((ROOT/'field-bosses.lua').read_text(encoding='utf-8'))(
        core,lua.table_from(field_specs,recursive=True),
        lua.table_from({'jadeplume':jade,'cryoRegisvine':cryo_field,'pyroRegisvine':pyro_field,
                        'anemoHypostasis':anemo_field,'electroHypostasis':electro_field})
    )
    return lua, core

def native(value):
    if hasattr(value, 'items'):
        pairs = list(value.items())
        if pairs and all(isinstance(k, int) for k, _ in pairs):
            return [native(value[i]) for i in range(1, len(pairs)+1)]
        return {k: ([native(v[i]) or [] for i in range(1,len(v)+1)] if k=='loadout' else ([] if k in ('items','ground','projectiles','auras','reactions','grappleNodes','mimics') and hasattr(v,'items') and len(v)==0 else native(v))) for k, v in pairs}
    return value
