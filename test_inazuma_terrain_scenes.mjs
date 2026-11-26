import {checkTerrainScenes} from './tools/check_terrain_scenes.mjs';

const groups={
 inaTataraFurnace:['ina-wp-12715','ina-wp-12718'],
 inaYougouStair:['ina-wp-12733','ina-wp-12738'],
 toriiforest:['ina-wp-12726'],
 inaByakkoMeadow:['ina-wp-12728'],
 inaYashioriRift:['ina-wp-12749','ina-wp-12704'],
 inaSerpentQuarry:['maguu-approach'],
 inaSuigetsuPool:['watatsumi-landing','ina-wp-15940','ina-wp-15951'],
 inaFogIslet:['tsurumi-coast'],
 inaSeiraiCrags:['thunder-approach','ina-wp-16022','ina-wp-16026','ina-wp-16029'],
 teaLanding:['ina-wp-12722','ina-wp-13669','ina-wp-13670'],
 inazuma:['inazuma-port'],
 inazumatown:['inazuma-town']
};
await checkTerrainScenes(groups,['ina-wp-12715','ina-wp-12733','watatsumi-landing','thunder-approach'],'inazuma');
