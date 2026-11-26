import {checkTerrainScenes} from './tools/check_terrain_scenes.mjs';

const groups={
 chenyuCargoWharf:['liyue-crux-wharf','liyue-wp-104'],
 liyueGuyunShoal:['geo-approach','liyue-wp-100'],
 liyueNorthLakeshore:['oceanid-approach','liyue-wp-1748'],
 liyueAocangRidge:['liyue-wp-39','liyue-wp-40'],
 liyueJueyunPool:['liyue-wp-42'],
 liyueTianhengPass:['liyue-wp-92','liyue-wp-105','sites-corridor-liyue-switchback'],
 chasmQuarryLedge:['liyue-wp-26445'],
 chasm:['sites-corridor-chasm-border'],
 liyueGeovishapDen:['primo-approach'],
 liyue:['liyue-harbor'],
 liyuequarry:['liyue-quarry-post']
};
await checkTerrainScenes(groups,['liyue-wp-104','liyue-wp-39','liyue-wp-42','sites-corridor-chasm-border'],'liyue');
