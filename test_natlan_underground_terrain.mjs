import {checkTerrainScenes} from './tools/check_terrain_scenes.mjs';

const groups={
 atocpanPeakGrotto:['nat-wp-72441','nat-wp-72444','nat-wp-72450','nat-wp-79543','nat-wp-79544','nat-wp-81381','nat-wp-82567','nat-wp-82568','nat-wp-82569','nat-wp-82574'],
 balachkoGrateChamber:['nat-wp-72442','nat-wp-72443','nat-wp-72449','nat-wp-72451','nat-wp-72452','nat-wp-72455','nat-wp-79548','nat-wp-80033'],
 natFallsCavern:['nat-wp-72446','nat-wp-80040','nat-wp-82573'],
 natSpringKeyCave:['nat-wp-72425','nat-wp-72447','nat-wp-72448','nat-wp-77772'],
 natlan:['nat-wp-72413']
};
await checkTerrainScenes(groups,['nat-wp-72413','nat-wp-72443','nat-wp-72446','nat-wp-82569'],'natlan-underground');
