import {chromium} from 'playwright';
import {testDomainTerrain} from './tools/browser_domain_terrain_test.mjs';

await testDomainTerrain(chromium,{
  prefix:'li-highlands',hub:'liyue-harbor',uniqueBackgrounds:true,compareBackgrounds:true,
},[
  {name:'adit',stage:'sites-hunt-7173',host:'liyue-wp-35',x:610,y:417,
   beyond:'sites-hunt-7173-pocket-1',pocketScenery:'liyueStonehelmPit'},
  {name:'ruins',stage:'sites-hunt-7190',host:'liyue-field',x:610,y:424,
   beyond:'sites-hunt-7190-pocket-1',pocketScenery:'liyueSentinelYard'},
  {name:'island',stage:'sites-hunt-7215',host:'geo-approach',x:610,y:424,
   beyond:'sites-hunt-7215-pocket-1',pocketScenery:'liyueEmberGrotto'},
  {name:'vault',stage:'sites-hunt-7218',host:'liyue-wp-104',x:610,y:419,
   weeklyPreview:'boss-childe',beyond:'childe-golden-house-arena',pocketScenery:'liyueGoldenVault'},
  {name:'pass',stage:'sites-hunt-7220',host:'liyue-wp-105',x:2230,y:420,
   beyond:'sites-hunt-7220-pocket-1',pocketScenery:'liyueCinderShrine'},
  {name:'terraces',stage:'sites-hunt-9778',host:'primo-approach',x:2230,y:423},
  {name:'roots',stage:'sites-hunt-18048',host:'liyue-wp-45',x:610,y:419,screenshot:true,
   weeklyPreview:'boss-azhdaha',beyond:'azhdaha-dragon-seal-arena',
   detours:[{id:'azhdaha-dragon-seal-arena',scenery:'liyueSealedCavern'},
            {id:'sites-hunt-18048-pocket-2',scenery:'liyueFungalHollow'},
            {id:'sites-hunt-18048-pocket-1',scenery:'liyueRootSeal'}],
   pocketRoles:[['sites-hunt-18048-pocket-2','rare_pocket',389],['sites-hunt-18048-pocket-1','optional_elite',480]]},
]);
