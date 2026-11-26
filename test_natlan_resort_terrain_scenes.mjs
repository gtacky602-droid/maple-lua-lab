import {checkTerrainScenes} from './tools/check_terrain_scenes.mjs';

const groups={
 natVolcanicShore:['nat-wp-85957','nat-resort-pier','nat-wp-85959','nat-wp-85965','nat-wp-85968','nat-wp-85969','nat-wp-85970','nat-wp-85972','nat-wp-85974','nat-wp-85976','nat-wp-85978','nat-wp-72418','nat-wp-72419','nat-wp-72420','nat-wp-72456','nat-wp-79482','nat-wp-82563','nat-wp-82576'],
 natSouthernClearing:['nat-wp-85963','nat-wp-85964','nat-wp-85973','nat-wp-85977','nat-wp-85349'],
 natlanKinichHunt:['nat-wp-85960','nat-wp-85961','nat-wp-85975'],
 toyacShallowShore:['nat-wp-85971'],
 natSpringKeyCave:['nat-wp-85979','nat-wp-85980'],
 balachkoGrateChamber:['nat-wp-85981'],
 natlanRiverTrial:['nat-wp-85966','nat-wp-85967']
};
await checkTerrainScenes(groups,['nat-resort-pier','nat-wp-85964','nat-wp-85979','nat-wp-85981'],'natlan-resort');
