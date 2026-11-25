import {chromium} from 'playwright';
import {testDomainTerrain} from './tools/browser_domain_terrain_test.mjs';

const tower='sites-hunt-7111', rare=tower+'-pocket-2', elite=tower+'-pocket-1';
await testDomainTerrain(chromium,{
  prefix:'mond-ruins', hub:'mond-town', uniqueBackgrounds:true, compareBackgrounds:true,
},[
  {name:'garden',stage:'sites-hunt-7092',host:'mond-wp-21',x:2230,y:424,
   beyond:'sites-hunt-7092-pocket-1',pocketScenery:'mondRiftBurrow'},
  {name:'tower',stage:tower,host:'mond-wp-24',x:2230,y:420,screenshot:true,beyond:rare,
   detours:[{id:rare,scenery:'mondQuietLookout'},{id:elite,scenery:'mondShieldCamp'},{id:'dvalin-sky-arena',scenery:'dvalinWeekly'}],
   pocketRoles:[[rare,'rare_pocket',389],[elite,'optional_elite',480]]},
  {name:'valley',stage:'sites-hunt-7137',host:'mond-wp-19',x:610,y:421,
   beyond:'sites-hunt-7137-pocket-1',pocketScenery:'mondLogHollow'},
]);
