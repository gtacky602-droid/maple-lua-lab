import {chromium} from 'playwright';
import {testDomainTerrain} from './tools/browser_domain_terrain_test.mjs';

await testDomainTerrain(chromium,{
  prefix:'sne-domains',hub:'snezhnaya-hub',uniqueBackgrounds:true,compareBackgrounds:true,
},[
  {name:'icewall',stage:'sites-hunt-100705',host:'sne-wp-100658',x:2230,y:418,
   beyond:'sites-hunt-100705-pocket-1',pocketScenery:'sneWarriorShelf'},
  {name:'cut',stage:'sites-hunt-100706',host:'white-pass-cut',x:610,y:423,
   beyond:'sites-hunt-100706-pocket-1',pocketScenery:'sneSnowboundShed'},
  {name:'underpass',stage:'sites-hunt-100707',host:'sne-wp-100695',x:2230,y:421,screenshot:true,
   beyond:'sne-obsession-scar-upper-trail',pocketScenery:'whiteRainbowBasin'},
]);
