import {checkTerrainScenes} from './tools/check_terrain_scenes.mjs';

const groups={
 ochkaBronzeCourt:['nat-sky-camp','nat-wp-96366','nat-wp-96367','nat-wp-96369','nat-wp-96370','nat-wp-96373','nat-wp-96375'],
 ochkanatlan:['nat-wp-96368','nat-wp-96371','nat-wp-96372','nat-wp-96376','nat-wp-96377'],
 skySandCourtyard:['nat-wp-96378'],
 aamsWolfHall:['nat-wp-96374','nat-wp-96380','nat-wp-96381','nat-wp-96382'],
 gateCourt:['nat-wp-96379','nat-wp-96383','nat-wp-96384']
};
await checkTerrainScenes(groups,['nat-wp-96375','nat-wp-96376','nat-wp-96382','nat-wp-96383'],'sky-temple');
