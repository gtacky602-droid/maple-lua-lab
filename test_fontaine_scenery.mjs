import {checkTerrainScenes} from './tools/check_terrain_scenes.mjs';

const groups={
 fontaine:['fontaine-entry','fontaine-hub','fontaine-field'],
 fontaineBerylCoast:['fon-wp-50035','fontaine-beryl-bank','fon-wp-50041','fon-wp-50046'],
 fontaineBerylSluice:['fon-wp-50047'],
 fontaineNorthTidegate:['fon-wp-53858'],
 fontaineNorthHeadland:['fon-wp-53862','fon-wp-55770'],
 fontaineBackstage:['fontaine-stage-watch'],
 fontaineDelivery:['fon-wp-53852','fon-wp-55775','sites-lumidouce-landing'],
 nostoiIslandPier:['fon-wp-68341']
};
await checkTerrainScenes(groups,['fon-wp-50035','fon-wp-50047','fontaine-stage-watch','fon-wp-68341'],'fontaine');
