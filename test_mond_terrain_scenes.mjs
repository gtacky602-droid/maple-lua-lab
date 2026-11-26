import {checkTerrainScenes} from './tools/check_terrain_scenes.mjs';

const groups={
 goldenDock:['mond-wp-15'],
 mondEagleCape:['mond-wp-9','mond-wp-10','mond-wp-17'],
 mondQuietLookout:['mond-wp-23','mond-wp-27'],
 mondBrokenSpire:['mond-wp-24','mond-wp-25','mond-wp-26'],
 mondCeciliaGarden:['mond-wp-21'],
 mondMemoryValley:['mond-wp-19'],
 mondLionTemple:['mond-wp-18'],
 mondstadt:['mond-town'],
 shiomicape:['inazuma-shiomi-cape']
};
await checkTerrainScenes(groups,['mond-wp-15','mond-wp-17','mond-wp-23','mond-wp-24'],'mond');
