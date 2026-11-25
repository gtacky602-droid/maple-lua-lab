import {chromium} from 'playwright';
import {testDomainTerrain} from './tools/browser_domain_terrain_test.mjs';

await testDomainTerrain(chromium,{
  prefix:'nod-islands',hub:'nod-town',uniqueBackgrounds:true,compareBackgrounds:true,
},[
  {name:'hiisi',stage:'sites-hunt-88121',host:'nod-wp-88133',x:2230,y:423,
   beyond:'sites-hunt-88121-pocket-1',pocketScenery:'nodReedDen'},
  {name:'lempo',stage:'sites-hunt-88122',host:'nod-wp-88144',x:2230,y:418,
   beyond:'sites-hunt-88122-pocket-1',pocketScenery:'nodFrostKiln'},
  {name:'paha',stage:'sites-hunt-88123',host:'nod-wp-88129',x:610,y:424,
   beyond:'sites-hunt-88123-pocket-1',pocketScenery:'nodSurfHollow'},
  {name:'highlands',stage:'sites-hunt-92859',host:'nod-wp-92885',x:2230,y:421,
   beyond:'sites-hunt-92859-pocket-1',pocketScenery:'nodWindShelter'},
  {name:'fault',stage:'sites-hunt-92860',host:'nod-wp-92892',x:610,y:418,screenshot:true},
]);
