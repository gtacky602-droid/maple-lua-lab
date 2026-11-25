import {chromium} from 'playwright';
import {testDomainTerrain} from './tools/browser_domain_terrain_test.mjs';

await testDomainTerrain(chromium,{
  prefix:'mond-temples',hub:'mond-town',uniqueBackgrounds:true,compareBackgrounds:true,
},[
  {name:'rift',stage:'sites-hunt-7149',host:'mond-wp-14',x:2230,y:421,
   beyond:'sites-hunt-7149-pocket-1',pocketScenery:'mondAgentHideout'},
  {name:'falcon',stage:'sites-hunt-7157',host:'mond-road',x:610,y:417},
  {name:'lion',stage:'sites-hunt-7186',host:'mond-wp-18',x:610,y:424},
  {name:'court',stage:'sites-hunt-7201',host:'mond-wp-7',x:610,y:420},
  {name:'wolf',stage:'sites-hunt-7206',host:'mond-wp-7',x:610,y:422,
   beyond:'sites-hunt-7206-pocket-1',pocketScenery:'mondFloodedAlcove'},
  {name:'cape',stage:'sites-hunt-7210',host:'mond-wp-17',x:2230,y:419,screenshot:true,
   beyond:'sites-hunt-7210-pocket-1',pocketScenery:'mondWindBasin'},
]);
