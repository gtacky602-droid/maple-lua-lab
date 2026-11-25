import {chromium} from 'playwright';
import {testDomainTerrain} from './tools/browser_domain_terrain_test.mjs';

await testDomainTerrain(chromium, {
  prefix:'li-north',hub:'liyue-harbor',uniqueBackgrounds:true,compareBackgrounds:true,
}, [
  {name:'ridge',stage:'sites-hunt-7114',host:'liyue-wp-39',x:610,y:419,screenshot:true,
   beyond:'sites-hunt-7114-pocket-1',pocketScenery:'liyueGeovishapDen'},
  {name:'pool',stage:'sites-hunt-7116',host:'liyue-wp-42',x:610,y:422},
  {name:'lake',stage:'sites-hunt-7121',host:'oceanid-approach',x:610,y:426,
   beyond:'sites-hunt-7121-pocket-1',pocketScenery:'liyueFireaxeCamp'},
]);
