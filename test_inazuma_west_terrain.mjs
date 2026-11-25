import { chromium } from 'playwright';
import { testDomainTerrain } from './tools/browser_domain_terrain_test.mjs';

const rift='sites-hunt-12791', rare=rift+'-pocket-2', elite=rift+'-pocket-1';
await testDomainTerrain(chromium,{
  prefix:'inazuma-west', hub:'inazuma-town', uniqueBackgrounds:true, compareBackgrounds:true,
},[
  {name:'furnace',host:'ina-wp-12715',stage:'sites-hunt-12788',x:650,y:422,
   beyond:'sites-hunt-12788-pocket-1',pocketScenery:'inaMirrorGallery'},
  {name:'rift',host:'ina-wp-12749',stage:rift,x:650,y:420,beyond:rare,screenshot:true,
   detours:[{id:rare,scenery:'inaRiftBoneDen'},{id:elite,scenery:'inaRiftMachineBay'}],
   pocketRoles:[[rare,'rare_pocket',380],[elite,'optional_elite',480]]},
  {name:'quarry',host:'maguu-approach',stage:'sites-hunt-12794',x:2330,y:424},
]);
