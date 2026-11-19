from pathlib import Path
import sys, json
from experience import RUNTIME_EXP, resolve_story_exp, resolve_stygian_exp
ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT.parent / 'lua-limit-break-20261026-r1/work/python'))
from lupa.lua53 import LuaRuntime

def asset_entries(container):
    rows = container.items() if isinstance(container, dict) else enumerate(container, 1)
    return ((key, value, isinstance(value, (dict, list))) for key, value in rows)


def field_art(lua, prefix, poses, *, idle=None, idle_anchor=None, variants=None):
    filenames = {
        pose: f'{prefix}-field-{pose.replace("_", "-")}-sprites-v1.json'
        for pose in poses
    }
    if idle:
        filenames['idle'] = idle
    if variants:
        filenames.update(variants)

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
    imprint=json.loads((ROOT/'content/imprint-settings.json').read_text(encoding='utf8'))
    lua.execute((ROOT / 'artifacts.lua').read_text(encoding='utf-8'))(core,lua.table_from(imprint,recursive=True))
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
    field_specs=json.loads((ROOT/'content/field-boss-spawns.json').read_text(encoding='utf-8-sig'))['fieldBosses']
    weekly_specs=json.loads((ROOT/'content/weekly-boss-spawns.json').read_text(encoding='utf8'))['weeklyBosses']
    story_data['bossNodes']={
        target:spec['node'] for spec in field_specs+weekly_specs
        for target in (spec['id'],spec.get('storyChallenge')) if target}
    stygian=resolve_stygian_exp(json.loads((ROOT/'content/stygian-matches.json').read_text(encoding='utf8'))['matches'])
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
    core.coastalGifts=field_art(lua,'coastal-gifts',(),variants={
        gift:f'coastal-gifts-{gift}-sprites-v1.json' for gift in ('biscuit','chime','tea')})
    appraisal=lua.execute((ROOT/'story-appraisal.lua').read_text(encoding='utf8'))
    core.appraisalArt=field_art(lua,'nod-appraisal',(),variants={
        kind:f'nod-appraisal-{kind}-sprites-v1.json' for kind in ('gear','plate','stone','machine','lamp')})
    rumor=lua.execute((ROOT/'story-rumor.lua').read_text(encoding='utf8'))
    core.rumorArt=field_art(lua,'nod-rumor',(),variants={
        kind:f'nod-rumor-{kind}-sprites-v1.json'
        for kind in ('glint','little','stolen','boatkeeper','courier','painter')})
    bloom=lua.execute((ROOT/'story-bloom.lua').read_text(encoding='utf8'))
    core.bloomArt=field_art(lua,'nod-moon-bloom',(),variants={
        kind:f'nod-moon-bloom-{kind}-sprites-v1.json'
        for kind in ('bud','flower','overhead','charm','rabbit','fox','petal','berry')})
    patrol=lua.execute((ROOT/'story-patrol.lua').read_text(encoding='utf8'))
    core.patrolArt=field_art(lua,'nod-lantern-patrol',(),variants={
        kind:f'nod-lantern-patrol-{kind}-sprites-v1.json' for kind in ('lantern','tea','biscuits')})
    survey_rig=lua.execute((ROOT/'story-survey-rig.lua').read_text(encoding='utf8'))
    core.surveyEquipment=field_art(lua,'sne-survey',(),variants={
        kind:f'sne-survey-{kind}-sprites-v1.json' for kind in ('lens','clamp','blanket')})
    snow_match=lua.execute((ROOT/'story-snow-match.lua').read_text(encoding='utf8'))
    core.snowMatchArt=field_art(lua,'sne-snow-match',(),variants={
        kind:f'sne-snow-match-{kind}-sprites-v1.json' for kind in ('wall','rubble','flag')})
    core.snowMatchHost=field_art(lua,'childe',(),idle='childe-idle-sprites.json').idle
    return_box=lua.execute((ROOT/'story-return-box.lua').read_text(encoding='utf8'))
    core.returnBoxArt=field_art(lua,'mond-return-box',(),variants={
        kind:f'mond-return-box-{kind}-sprites-v1.json' for kind in ('crate','bookmark','mud','grass')})
    core.returnBoxCarrier=field_art(lua,'hydro-slime',(),idle='hydro-slime-idle-sprites.json').idle
    night_banner=lua.execute((ROOT/'story-night-banner.lua').read_text(encoding='utf8'))
    core.nightBannerArt=field_art(lua,'mond-night-banner',(),variants={
        kind:f'mond-night-banner-{kind}-sprites-v1.json' for kind in ('torn','repaired','shadow')})
    fireworks=lua.execute((ROOT/'story-fireworks.lua').read_text(encoding='utf8'))
    core.fireworkArt=field_art(lua,'ina-fireworks',(),variants={
        kind:f'ina-fireworks-{kind}-sprites-v1.json' for kind in ('window','marker','stand')})
    stealth=lua.execute((ROOT/'story-stealth.lua').read_text(encoding='utf8'))
    core.stealthArt=field_art(lua,'ina-sayu-route',(),variants={
        kind:f'ina-sayu-route-{kind}-sprites-v1.json' for kind in ('brush','cave','tree','gate','leaf','nap')})
    itto_games=lua.execute((ROOT/'story-itto-games.lua').read_text(encoding='utf8'))
    core.ittoGameArt=field_art(lua,'ina-itto-games',(),variants={
        kind:f'ina-itto-games-{kind}-sprites-v1.json' for kind in ('flag','target','blue','orange','bell','prize')})
    tea_case=lua.execute((ROOT/'story-tea-case.lua').read_text(encoding='utf8'))
    core.teaCaseArt=field_art(lua,'ina-tea-case',(),variants={
        **{kind:f'ina-tea-case-{kind}-sprites-v1.json' for kind in ('cart','keeper','paper','tracks','day','dusk')},
        'cup':'nod-lantern-patrol-tea-sprites-v1.json',
    })
    wanderer_survey=lua.execute((ROOT/'story-wanderer-survey.lua').read_text(encoding='utf8'))
    core.wandererSurveyArt=field_art(lua,'sum-wanderer-sign',(),variants={
        kind:f'sum-wanderer-sign-{kind}-sprites-v1.json' for kind in ('root','stone','ring','lever','leverOn','sign')})
    observation_visitors=lua.execute((ROOT/'story-observation-visitors.lua').read_text(encoding='utf8'))
    core.observationVisitorsArt=field_art(lua,'sum-fungus-visitors',(),variants={
        kind:f'sum-fungus-visitors-{kind}-sprites-v1.json' for kind in ('instrument','satchel','traces','sample','cabinet','cabinetClosed')})
    collei_guide=lua.execute((ROOT/'story-collei-guide.lua').read_text(encoding='utf8'))
    core.colleiGuideArt=field_art(lua,'sum-collei-guide',(),variants={
        **{kind:f'sum-collei-guide-{kind}-sprites-v1.json' for kind in ('root','stones','shelter','bench','barrier','letter')},
        'guest':'sum-collei-guest-sprites-v1.json',
    })
    kaveh_model=lua.execute((ROOT/'story-kaveh-model.lua').read_text(encoding='utf8'))
    core.kavehRoomArt=field_art(lua,'sum-kaveh-room',(),variants={
        kind:f'sum-kaveh-room-{kind}-sprites-v1.json' for kind in ('table','shelfHigh','shelfLow','desk','windowOut','windowIn')})
    nahida_map=lua.execute((ROOT/'story-discovery-map.lua').read_text(encoding='utf8'))
    core.nahidaMapArt=field_art(lua,'sum-nahida-map',(),variants={
        kind:f'sum-nahida-map-{kind}-sprites-v1.json' for kind in ('leaf','roots','branches','sky','dew','board')})
    emilie_scent=lua.execute((ROOT/'story-emilie-scent.lua').read_text(encoding='utf8'))
    core.emilieScentArt=field_art(lua,'fon-emilie-scent',(),variants={
        kind:f'fon-emilie-scent-{kind}-sprites-v1.json'
        for kind in ('flower','dry','wood','trial','amber','pink','mint','table')})
    furina_cues=lua.execute((ROOT/'story-furina-cues.lua').read_text(encoding='utf8'))
    core.furinaCueArt=field_art(lua,'fon-furina-cues',(),variants={
        key:f'fon-furina-cues-{key}-sprites-v1.json' for key in ('console','lamp','curtain')})
    navia_photo=lua.execute((ROOT/'story-navia-photo.lua').read_text(encoding='utf8'))
    core.naviaPhotoArt=field_art(lua,'fon-navia-photo',(),variants={
        **{key:f'fon-navia-photo-{key}-sprites-v1.json' for key in ('camera','chair','crate','board','snack','tickets')},
        **{key:f'fon-navia-people-{key}-sprites-v1.json'
           for key in ('porter','baker','mechanic','porterSmile','bakerSmile','mechanicSmile')},
    })
    lyney_magic=lua.execute((ROOT/'story-lyney-magic.lua').read_text(encoding='utf8'))
    core.lyneyMagicArt=field_art(lua,'fon-lyney-magic',(),variants={
        part:f'fon-lyney-magic-{part}-sprites-v1.json' for part in ('cart','broken','screen','birds')})
    freminet_dive=lua.execute((ROOT/'story-freminet-dive.lua').read_text(encoding='utf8'))
    core.freminetDiveArt=field_art(lua,'fon-freminet-dive',(),variants={
        kind:f'fon-freminet-dive-{kind}-sprites-v1.json' for kind in ('toy','buoy','coral','marker')})
    stone_ornaments=lua.execute((ROOT/'story-stone-ornaments.lua').read_text(encoding='utf8'))
    core.stoneOrnamentArt=field_art(lua,'nat-kachina-charms',(),variants={
        kind:f'nat-kachina-charms-{kind}-sprites-v1.json'
        for kind in ('table','outcrop','pendant','amber','teal','purple')})
    mualani_surf=lua.execute((ROOT/'story-mualani-surf.lua').read_text(encoding='utf8'))
    core.mualaniSurfArt=field_art(lua,'nat-mualani-surf',(),variants={
        kind:f'nat-mualani-surf-{kind}-sprites-v1.json'
        for kind in ('board','hoop','wave','saurian','ball','charm')})
    kinich_ambush=lua.execute((ROOT/'story-kinich-ambush.lua').read_text(encoding='utf8'))
    core.kinichHuntArt=field_art(lua,'nat-kinich-ambush',(),variants={
        kind:f'nat-kinich-ambush-{kind}-sprites-v1.json' for kind in ('tracks','branch','marker','cover')})
    xilonen_springs=lua.execute((ROOT/'story-xilonen-springs.lua').read_text(encoding='utf8'))
    core.springCourseArt=field_art(lua,'nat-xilonen-course',(),variants={
        kind:f'nat-xilonen-course-{kind}-sprites-v1.json' for kind in ('high','low','roof','bench','flag','timer')})
    iansan_training=lua.execute((ROOT/'story-iansan-training.lua').read_text(encoding='utf8'))
    core.iansanTrainingArt=field_art(lua,'nat-iansan-training',(),variants={
        kind:f'nat-iansan-training-{kind}-sprites-v1.json' for kind in ('dummy','pad','water','board','flag','marker')})
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
    core.enemyIdleArt=lua.table_from({
        key: json.loads((ROOT/'assets'/layout.get('file', f'{key}-idle-sprites.json')).read_text(encoding='utf8'))
        for key, layout in enemy_layout.items()
    }, recursive=True)
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
    story_nodes={node['id']:node for node in story_data['nodes']}
    for spec in field_specs:
        cover=[platform for platform in story_nodes[spec['node']]['platforms'] if platform.get('cover')]
        if cover:
            spec['cover']=cover
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
    wenut=lua.execute((ROOT/'field-wenut.lua').read_text(encoding='utf-8'))(core)
    core.wenutFieldArt=field_art(lua,'wenut',('idle','sweep','stream','dive','emerge','orb'))
    baptist=lua.execute((ROOT/'field-baptist.lua').read_text(encoding='utf-8'))(core)
    core.baptistFieldArt=field_art(lua,'baptist',('bolt','fall','rings','recover'),idle='baptist-idle-sprites.json')
    emperor=lua.execute((ROOT/'field-emperor.lua').read_text(encoding='utf-8'))(core)
    core.emperorFieldArt=field_art(lua,'emperor',('guard','claw','fire','exposed'))
    seahorse=lua.execute((ROOT/'field-seahorse.lua').read_text(encoding='utf-8'))(core)
    core.seahorseFieldArt=field_art(lua,'seahorse',('sweep','charge','dive','dim'),
                                   idle='seahorse-idle-sprites.json',idle_anchor=.28)
    generator=lua.execute((ROOT/'field-generator.lua').read_text(encoding='utf-8'))(core)
    core.generatorFieldArt=field_art(lua,'field-generator',('sweep','stones','quake','recover'),
                                    idle='field-generator-idle-sprites.json')
    tulpa=lua.execute((ROOT/'field-tulpa.lua').read_text(encoding='utf-8'))(core)
    core.tulpaFieldArt=field_art(lua,'tulpa',('spear','hammer','merge','surge','settled','half'),
                               idle='tulpa-idle-sprites.json')
    icewind=lua.execute((ROOT/'field-icewind.lua').read_text(encoding='utf-8'))(core)
    core.coppeliaFieldArt=field_art(lua,'coppelia',('idle','attack','focus','bow'))
    core.coppeliusFieldArt=field_art(lua,'coppelius',('idle','attack','focus','bow'))
    legatus=lua.execute((ROOT/'field-legatus.lua').read_text(encoding='utf-8'))(core)
    core.legatusFieldArt=field_art(lua,'legatus',('sweep','charge','conduct','stagger'),
                                  idle='legatus-idle-sprites.json')
    suanni=lua.execute((ROOT/'field-suanni.lua').read_text(encoding='utf-8'))(core)
    core.suanniFieldArt=field_art(lua,'suanni',('claw','tail','water','crouch','leap','rest'),
                                 idle='suanni-idle-sprites.json')
    qucusaur=lua.execute((ROOT/'field-qucusaur.lua').read_text(encoding='utf-8'))(core)
    core.qucusaurFieldArt=field_art(lua,'qucusaur',('wing','ready','rest','gold-hover','gold-dive','feather'),
                                   idle='qucusaur-idle-sprites.json')
    yumka=lua.execute((ROOT/'field-yumka.lua').read_text(encoding='utf-8'))(core)
    core.yumkaFieldArt=field_art(lua,'yumka',('tail','crouch','leap','land','fruit','seed'),
                                idle='yumka-idle-sprites.json')
    config_device=lua.execute((ROOT/'field-config-device.lua').read_text(encoding='utf-8'))(core)
    core.configDeviceFieldArt=field_art(lua,'config-device',('claw-a','claw-b','beam','charge','down','collector'),
                                       idle='config-device-idle-sprites.json')
    papilla=lua.execute((ROOT/'field-papilla.lua').read_text(encoding='utf-8'))(core)
    core.papillaFieldArt=field_art(lua,'papilla',('stem-ready','stem-strike','wing-ready','wing-strike',
                                               'fungus-ready','fungus-strike'),idle='papilla-idle-sprites.json')
    lava_dragon=lua.execute((ROOT/'field-lava-dragon.lua').read_text(encoding='utf-8'))(core)
    core.lavaDragonFieldArt=field_art(lua,'lava-dragon',('slam-ready','slam-strike','fissure','lunge','eruption','overburn'),
                                    idle='lava-dragon-sprites.json',variants={'molten':'lava-dragon-molten-sprites.json'})
    overseer=lua.execute((ROOT/'field-overseer.lua').read_text(encoding='utf-8'))(core)
    core.overseerFieldArt=field_art(lua,'overseer',('blade-ready','blade-cross','purge','cooled','crest','plume'),
                                   idle='overseer-idle-sprites.json')
    knuckle_duck=lua.execute((ROOT/'field-knuckle-duckle.lua').read_text(encoding='utf-8'))(core)
    core.knuckleDuckFieldArt=field_art(lua,'knuckle-duckle',('windup','punch','stomp','guard','down','mecha'),
                                       idle='knuckle-duckle-idle-sprites.json')
    battleship=lua.execute((ROOT/'field-battleship.lua').read_text(encoding='utf-8'))(core)
    core.battleshipFieldArt=field_art(lua,'battleship',('saw-ready','sweep','cannon','heated','ward','down'),
                                     idle='battleship-idle-sprites.json')
    frostnight_herra=lua.execute((ROOT/'field-frostnight-herra.lua').read_text(encoding='utf-8'))(core)
    core.frostnightHerraFieldArt=field_art(lua,'frostnight-herra',('ready','sweep','leap','land','gloom','down'),
                                          idle='frostnight-herra-idle-sprites.json')
    whisperer_nightmares=lua.execute((ROOT/'field-whisperer-nightmares.lua').read_text(encoding='utf-8'))(core)
    core.whispererNightmaresFieldArt=field_art(lua,'whisperer-nightmares',('ready','lunge','emerge','shield','down','fisher'),
                                             idle='whisperer-nightmares-idle-sprites.json')
    lua.execute((ROOT/'radiant-cocoon.lua').read_text(encoding='utf-8'))(core)
    moonfly=lua.execute((ROOT/'field-moonfly.lua').read_text(encoding='utf-8'))(core)
    core.moonflyFieldArt=field_art(lua,'moonfly',('ready','kick','green','flame','cocoon','down'),
                                 idle='moonfly-idle-sprites.json')
    moongecko=lua.execute((ROOT/'field-moongecko.lua').read_text(encoding='utf-8'))(core)
    core.moongeckoFieldArt=field_art(lua,'moongecko',('ready','tail','leap','charge','down','anchor'),
                                   idle='moongecko-idle-sprites.json')
    spiritspeaker=lua.execute((ROOT/'field-spiritspeaker.lua').read_text(encoding='utf-8'))(core)
    core.spiritspeakerFieldArt=field_art(lua,'spiritspeaker',('ready','sweep','cast','ritual','reflection','down'),
                                      idle='spiritspeaker-field-ready-sprites-v1.json')
    fallen_vigil=lua.execute((ROOT/'field-fallen-vigil.lua').read_text(encoding='utf-8'))(core)
    core.fallenVigilFieldArt=field_art(lua,'fallen-vigil',('ready','lunge','throw','monitor','down','star'),
                                     idle='fallen-vigil-field-ready-sprites-v1.json')
    flugel=lua.execute((ROOT/'field-flugel.lua').read_text(encoding='utf-8'))(core)
    core.flugelFieldArt=field_art(lua,'flugel',('ready','slash','dive','charge','down','orb'),
                                idle='flugel-field-ready-sprites-v1.json')
    drifting_snow=lua.execute((ROOT/'field-drifting-snow.lua').read_text(encoding='utf-8'))(core)
    core.driftingSnowFieldArt=field_art(lua,'drifting-snow',('ready','slash','cast','coffin','down','spear'),
                                      idle='drifting-snow-field-ready-sprites-v1.json')
    immortal_construct=lua.execute((ROOT/'field-immortal-construct.lua').read_text(encoding='utf-8'))(core)
    core.immortalConstructFieldArt=field_art(lua,'immortal-construct',('ready','rake','wing','bloom','down','seed'),
                                           idle='immortal-construct-field-ready-sprites-v1.json')
    wavebinder=lua.execute((ROOT/'field-wavebinder.lua').read_text(encoding='utf-8'))(core)
    core.wavebinderFieldArt=field_art(lua,'wavebinder',('ready','sweep','throw','drink','down','anchor'),
                                    idle='wavebinder-field-ready-sprites-v1.json')
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
    snow_sweeper=lua.execute((ROOT/'field-snow-sweeper.lua').read_text(encoding='utf8'))(core)
    core.snowSweeperArt=field_art(lua,'snow-sweeper',('idle','plow','vent'))
    frost_antler=lua.execute((ROOT/'field-frost-antler.lua').read_text(encoding='utf8'))(core)
    core.frostAntlerArt=field_art(lua,'frost-antler',('idle','scrape','exposed'))
    windward_tower=lua.execute((ROOT/'field-windward-tower.lua').read_text(encoding='utf8'))(core)
    core.windwardTowerArt=field_art(lua,'windward-tower',('idle','braced','open'))
    rubble_sifter=lua.execute((ROOT/'field-rubble-sifter.lua').read_text(encoding='utf8'))(core)
    core.rubbleSifterArt=field_art(lua,'rubble-sifter',('idle','heating','open'))
    prism_walker=lua.execute((ROOT/'field-prism-walker.lua').read_text(encoding='utf8'))(core)
    core.prismWalkerArt=field_art(lua,'prism-walker',('idle',))
    ice_crawler=lua.execute((ROOT/'field-ice-crawler.lua').read_text(encoding='utf8'))(core)
    core.iceCrawlerArt=field_art(lua,'ice-crawler',('idle','open'))
    rime_hare=lua.execute((ROOT/'field-rime-hare.lua').read_text(encoding='utf8'))(core)
    core.rimeHareArt=field_art(lua,'rime-hare',('idle',))
    tea_boulder=lua.execute((ROOT/'field-tea-boulder.lua').read_text(encoding='utf8'))(core)
    core.teaBoulderArt=field_art(lua,'tea-boulder',('idle',))
    plate_tail=lua.execute((ROOT/'field-plate-tail.lua').read_text(encoding='utf8'))(core)
    core.plateTailArt=field_art(lua,'plate-tail',('idle',))
    field_display=lua.execute((ROOT/'field-display.lua').read_text(encoding='utf8'))
    wind_ring=field_display(core,field_art(lua,'wind-ring',('idle',)).idle)
    bell_gate=field_display(core,field_art(lua,'bellgate',('idle',)).idle)
    canopy_fungus=field_display(core,field_art(lua,'canopy-fungus',('idle',)).idle)
    core.trolleyArt=field_art(lua,'mirage-trolley',('idle',),idle='mirage-trolley-sprites-v1.json').idle
    core.parcelMekaArt=field_art(lua,'parcel-meka',('idle',),idle='parcel-meka-sprites-v1.json').idle
    core.stageWaveArt=field_art(lua,'stage-wave',('idle',),idle='stage-wave-sprites-v1.json').idle
    core.grandFinaleArt=field_art(lua,'grand-finale',('idle',)).idle
    core.natlanRaceFlagArt=field_art(lua,'natlan-race-flag',('idle',),idle='natlan-race-flag-sprites-v1.json').idle
    core.natlanTrialRaftArt=field_art(lua,'natlan-trial-raft',('idle',),idle='natlan-trial-raft-sprites-v1.json').idle
    river_racer=field_display(core,field_art(lua,'river-racer',('idle',)).idle)
    river_racer.damageFactor=lua.eval("function(s) return s.duelRound and s.duelRound.phase=='opening' and 1 or .65 end")
    moon_crab=lua.execute((ROOT/'field-moon-crab.lua').read_text(encoding='utf8'))(core)
    core.moonCrabArt=field_art(lua,'moon-crab',('idle','cracked'))
    core.paperLanternArt=field_art(lua,'paper-lantern',('idle',),idle='paper-lantern-sprites-v1.json').idle
    core.nightTrialTotemArt=field_art(lua,'night-trial-totem',('idle',))
    branch_legend=lua.execute((ROOT/'field-branch-legend.lua').read_text(encoding='utf-8'))(core)
    water_legend=lua.execute((ROOT/'field-water-legend.lua').read_text(encoding='utf-8'))(core)
    legend_poses = ('idle', 'brace', 'strike')
    legend_revisions = {
        body['art']: spec.get('artRevision', 1)
        for spec in field_specs if spec['controller'] in {'branchLegend', 'waterLegend'}
        for body in (spec, spec.get('partner'), *spec.get('members', [])) if body and body.get('art')
    }
    core.branchLegendArt=lua.table_from({
        name: field_art(lua, name, legend_poses, variants={
            pose: f'{name}-field-{pose}-sprites-v{revision}.json' for pose in legend_poses
        })
        for name, revision in sorted(legend_revisions.items())
    })
    lua.execute((ROOT/'field-bosses.lua').read_text(encoding='utf-8'))(
        core,lua.table_from(field_specs,recursive=True),
        lua.table_from({'snowSweeper':snow_sweeper,'frostAntler':frost_antler,'windwardTower':windward_tower,
                        'rubbleSifter':rubble_sifter,'prismWalker':prism_walker,'iceCrawler':ice_crawler,'rimeHare':rime_hare,
                        'teaBoulder':tea_boulder,'plateTail':plate_tail,'windRing':wind_ring,'bellGate':bell_gate,
                        'canopyFungus':canopy_fungus,'grandFinale':field_display(core,core.grandFinaleArt),'riverRacer':river_racer,
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
    dvalin=lua.execute((ROOT/'weekly-dvalin.lua').read_text(encoding='utf-8'))(core)
    core.dvalinWeeklyArt=field_art(lua,'dvalin-weekly',(),variants={pose:'dvalin-weekly-'+pose+'-sprites-v1.json' for pose in ('hover','glide','perch','breath','roar','down','claw','head','crystal','orb','perch-body','breath-body')})
    andrius=lua.execute((ROOT/'weekly-andrius.lua').read_text(encoding='utf8'))(core)
    core.andriusWeeklyArt=field_art(lua,'andrius-weekly',(),variants={phase+'-'+pose:'andrius-weekly-'+phase+'-'+pose+'-sprites-v1.json' for phase,poses in [('normal',('ready','swipe','tail','leap','run','land')),('awake',('ready','rise','howl','run','leap','land','swipe','tail'))] for pose in poses})
    surveyor=lua.execute((ROOT/'weekly-surveyor.lua').read_text(encoding='utf8'))(core)
    core.surveyorArt=field_art(lua,'tide-surveyor',(),variants={pose:f'tide-surveyor-{pose}-sprites-v1.json' for pose in ('meter','sight','pendulum','swing','stand','reset')})
    loom=lua.execute((ROOT/'weekly-loom.lua').read_text(encoding='utf8'))(core)
    core.loomArt=field_art(lua,'twin-shuttle-loom',(),variants={
        pose:f'twin-shuttle-loom-{pose}-sprites-v1.json' for pose in ('closed','open','shuttle','broken')
    })
    childe=lua.execute((ROOT/'weekly-childe.lua').read_text(encoding='utf8'))(core)
    core.childeWeeklyArt=field_art(lua,'childe',(),variants={
        'human':'childe-idle-sprites.json','foul':'childe-foul-idle-sprites.json'})
    azhdaha=lua.execute((ROOT/'weekly-azhdaha.lua').read_text(encoding='utf8'))(core)
    core.azhdahaWeeklyArt=field_art(lua,'azhdaha',(),variants={'idle':'azhdaha-idle-sprites.json'})
    signora=lua.execute((ROOT/'weekly-signora.lua').read_text(encoding='utf8'))(core)
    core.signoraWeeklyArt=field_art(lua,'signora',(),variants={
        'cryo':'signora-idle-sprites.json','pyro':'signora-flame-idle-sprites.json'})
    raiden=lua.execute((ROOT/'weekly-raiden.lua').read_text(encoding='utf8'))(core)
    core.raidenWeeklyArt=field_art(lua,'raiden-boss',(),variants={
        'armored':'raiden-boss-idle-sprites.json','normal':'raiden-weekly-normal-sprites-v1.json'})
    shouki=lua.execute((ROOT/'weekly-shouki.lua').read_text(encoding='utf8'))(core)
    core.shoukiWeeklyArt=field_art(lua,'shouki',(),variants={
        'full':'shouki-idle-sprites.json','upper':'shouki-weekly-upper-sprites-v1.json'})
    apep_defense=lua.execute((ROOT/'weekly-apep-defense.lua').read_text(encoding='utf8'))(core)
    apep=lua.execute((ROOT/'weekly-apep.lua').read_text(encoding='utf8'))(core,apep_defense)
    core.apepWeeklyArt=field_art(lua,'apep',(),variants={
        'dark':'apep-dark-idle-sprites.json','prime':'apep-prime-idle-sprites.json','seed':'dendro-fungus-idle-sprites.json'})
    narwhal=lua.execute((ROOT/'weekly-narwhal.lua').read_text(encoding='utf8'))(core)
    core.narwhalWeeklyArt=field_art(lua,'narwhal',(),variants={
        'whale':'narwhal-idle-sprites.json','shadow':'narwhal-phantom-idle-sprites-v1.json'})
    knave=lua.execute((ROOT/'weekly-knave.lua').read_text(encoding='utf8'))(core)
    core.knaveWeeklyArt=field_art(lua,'knave-weekly',(),variants={
        'single':'knave-weekly-single-sprites-v1.json','double':'knave-weekly-double-sprites-v1.json'})
    primal_fire=lua.execute((ROOT/'weekly-primal-fire.lua').read_text(encoding='utf8'))(core)
    core.primalWeeklyArt=field_art(lua,'gosoythoth',(),idle='gosoythoth-idle-sprites.json')
    gate_moves=lua.execute((ROOT/'weekly-gate-moves.lua').read_text(encoding='utf8'))(core)
    gate=lua.execute((ROOT/'weekly-gate.lua').read_text(encoding='utf8'))(core,gate_moves)
    core.gateWeeklyArt=field_art(lua,'gate-weekly',(),variants={
        'king':'gate-weekly-king-sprites-v1.json','queen':'gate-weekly-queen-sprites-v1.json'})
    false_moon_moves=lua.execute((ROOT/'weekly-false-moon-attacks.lua').read_text(encoding='utf8'))(core)
    false_moon=lua.execute((ROOT/'weekly-false-moon.lua').read_text(encoding='utf8'))(core,false_moon_moves)
    core.falseMoonWeeklyArt=field_art(lua,'false-moon-weekly',(),idle='false-moon-weekly-idle-sprites-v1.json')
    heretic_moves=lua.execute((ROOT/'weekly-heretic-attacks.lua').read_text(encoding='utf8'))(core)
    heretic=lua.execute((ROOT/'weekly-heretic.lua').read_text(encoding='utf8'))(core,heretic_moves)
    core.hereticWeeklyArt=field_art(lua,'heretic-weekly',(),idle='heretic-weekly-idle-sprites-v1.json')
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
    stygian_beidou=lua.execute((ROOT/'stygian-beidou.lua').read_text(encoding='utf8'))(core)
    guard_assets={}
    beidou_audit=json.loads((ROOT/'assets/beidou-stygian-generation-v1.json').read_text(encoding='utf8'))
    for direction,pose in beidou_audit['poses'].items():
        art=json.loads((ROOT/'assets'/pose['encoding']).read_text(encoding='utf8'))
        crown,_,sole=pose['crownChinSoleY']
        art['heightScale']=art['box'][3]/(sole-crown)
        guard_assets[direction]=art
    core.stygianBeidouArt=lua.table_from({
        'idle':{'left':companion_art['beidou']['left'],'right':companion_art['beidou']},
        'guard':guard_assets,
    },recursive=True)
    stygian_geometry=lua.execute((ROOT/'stygian-geometry.lua').read_text(encoding='utf8'))
    capitano_moves=lua.execute((ROOT/'stygian-capitano-moves.lua').read_text(encoding='utf8'))(core,stygian_geometry)
    capitano=lua.execute((ROOT/'stygian-capitano.lua').read_text(encoding='utf8'))(core,capitano_moves)
    capitano_audit=json.loads((ROOT/'assets/capitano-stygian-generation-v1.json').read_text(encoding='utf8'))
    core.stygianCapitanoArt=lua.table_from({
        kind:{side:json.loads((ROOT/'assets'/f'capitano-{kind}-{side}-sprites-v1.json').read_text(encoding='utf8'))
              for side in ('left','right')}
        for kind in ('coat','battle','strike')
    } | {
        'sword':json.loads((ROOT/'assets/capitano-ice-sword-sprites-v1.json').read_text(encoding='utf8')),
        'hands':capitano_audit['hand_sockets'],
    },recursive=True)
    xbalanque_moves=lua.execute((ROOT/'stygian-xbalanque-moves.lua').read_text(encoding='utf8'))(core,stygian_geometry)
    xbalanque=lua.execute((ROOT/'stygian-xbalanque.lua').read_text(encoding='utf8'))(core,stygian_geometry,xbalanque_moves)
    xbalanque_audit=json.loads((ROOT/'assets/xbalanque-stygian-generation-v1.json').read_text(encoding='utf8'))
    core.stygianXbalanqueArt=lua.table_from({
        kind:{side:json.loads((ROOT/'assets'/f'xbalanque-{kind}-{side}-sprites-v1.json').read_text(encoding='utf8'))
              for side in ('left','right')}
        for kind in ('idle','guard','punch')
    } | {'hands':xbalanque_audit['hand_sockets']},recursive=True)
    rerir_moves=lua.execute((ROOT/'stygian-rerir-moves.lua').read_text(encoding='utf8'))(core,stygian_geometry)
    rerir_view=lua.execute((ROOT/'stygian-rerir-view.lua').read_text(encoding='utf8'))(core,stygian_geometry,rerir_moves)
    rerir=lua.execute((ROOT/'stygian-rerir.lua').read_text(encoding='utf8'))(core,stygian_geometry,rerir_moves,rerir_view)
    core.stygianRerirArt=lua.table_from({
        side:json.loads((ROOT/'assets'/f'rerir-idle-{side}-sprites-v1.json').read_text(encoding='utf8'))
        for side in ('left','right')
    },recursive=True)
    ronova_party=lua.execute((ROOT/'stygian-ronova-party.lua').read_text(encoding='utf8'))(core)
    ronova_moves=lua.execute((ROOT/'stygian-ronova-moves.lua').read_text(encoding='utf8'))(core,stygian_geometry,ronova_party)
    ronova_view=lua.execute((ROOT/'stygian-ronova-view.lua').read_text(encoding='utf8'))(core,stygian_geometry,ronova_moves)
    ronova=lua.execute((ROOT/'stygian-ronova.lua').read_text(encoding='utf8'))(core,stygian_geometry,ronova_party,ronova_moves,ronova_view)
    core.stygianRonovaArt=lua.table_from({
        kind:json.loads((ROOT/'assets'/f'ronova-{suffix}-sprites-v1.json').read_text(encoding='utf8'))
        for kind,suffix in {'left':'idle-left','right':'idle-right','wings':'wings'}.items()
    },recursive=True)
    wanderer_moves=lua.execute((ROOT/'stygian-wanderer-moves.lua').read_text(encoding='utf8'))(core,stygian_geometry)
    wanderer_view=lua.execute((ROOT/'stygian-wanderer-view.lua').read_text(encoding='utf8'))(core,stygian_geometry,wanderer_moves)
    wanderer=lua.execute((ROOT/'stygian-wanderer.lua').read_text(encoding='utf8'))(core,stygian_geometry,wanderer_moves,wanderer_view)
    core.stygianWandererArt=lua.table_from({
        direction:json.loads((ROOT/'assets'/f'wanderer-idle-{direction}-sprites-v3.json').read_text(encoding='utf8'))
        for direction in ('left','right')
    },recursive=True)
    farka_moves=lua.execute((ROOT/'stygian-farka-moves.lua').read_text(encoding='utf8'))(core,stygian_geometry)
    farka_view=lua.execute((ROOT/'stygian-farka-view.lua').read_text(encoding='utf8'))(core,stygian_geometry,farka_moves)
    farka=lua.execute((ROOT/'stygian-farka.lua').read_text(encoding='utf8'))(core,stygian_geometry,farka_moves,farka_view)
    farka_layers=json.loads((ROOT/'content/farka-idle-layers.json').read_text(encoding='utf8'))
    farka_sword=json.loads((ROOT/'assets'/farka_layers['sword']['file']).read_text(encoding='utf8'))
    sx,sy,sw,sh=farka_sword['box']
    gx,gy=farka_layers['sword']['grip']
    farka_sword['anchorX'],farka_sword['anchorY']=(gx-sx)/sw,(gy-sy)/sh
    farka_root=farka_layers['root']
    farka_hands={
        side:{hand:[value-root for value,root in zip(layer['sockets'][f'hand_{hand}'],farka_root)]
              for hand in ('front','back')}
        for side,layer in farka_layers['facings'].items()
    }
    core.stygianFarkaArt=lua.table_from({
        side:json.loads((ROOT/'assets'/layer['body']).read_text(encoding='utf8'))
        for side,layer in farka_layers['facings'].items()
    } | {'sword':farka_sword,'hands':farka_hands},recursive=True)
    lua.execute((ROOT/'endgame.lua').read_text(encoding='utf8'))(
        core,lua.table_from(abyss,recursive=True),lua.table_from(weekly_specs,recursive=True),
        lua.table_from(stygian,recursive=True),
        lua.table_from({'farka':farka,'beidou':stygian_beidou,'capitano':capitano,'xbalanque':xbalanque,
                        'rerir':rerir,'ronova':ronova,'wanderer':wanderer}))
    lua.execute((ROOT/'growth-trials.lua').read_text(encoding='utf8'))(core)
    atlas = json.loads((ROOT/'content/world-atlas.json').read_text(encoding='utf8'))
    lua.execute((ROOT/'world-atlas.lua').read_text(encoding='utf8'))(core,lua.table_from(atlas,recursive=True))
    return lua, core

def native(value):
    if hasattr(value, 'items'):
        pairs = list(value.items())
        if pairs and all(isinstance(k, int) for k, _ in pairs):
            return [native(value[i]) for i in range(1, len(pairs)+1)]
        return {k: ([native(v[i]) or [] for i in range(1,len(v)+1)] if k=='loadout' else ([] if k in ('items','ground','projectiles','auras','reactions','grappleNodes','mimics','activeSlots','carrySlots','dailyChoices') and hasattr(v,'items') and len(v)==0 else native(v))) for k, v in pairs}
    return value
