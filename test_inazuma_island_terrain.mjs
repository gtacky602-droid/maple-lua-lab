import {chromium} from 'playwright';
import {testDomainTerrain} from './tools/browser_domain_terrain_test.mjs';

await testDomainTerrain(chromium, {
  prefix:'inazuma-islands', hub:'inazuma-town', uniqueBackgrounds:true, compareBackgrounds:true,
}, [
  {name:'pool', stage:'sites-hunt-15949', host:'ina-wp-15951', x:2220, y:420},
  {name:'castle', stage:'sites-hunt-17223', host:'ina-wp-12722', x:650, y:423},
  {name:'islet', stage:'sites-hunt-18667', host:'tsurumi-coast', x:2310, y:425,
   beyond:'sites-hunt-18667-pocket-1', pocketScenery:'inaTideChamber'},
  {name:'seirai', stage:'sites-hunt-20369', host:'ina-wp-16030', x:650, y:421, screenshot:true},
  {name:'shrine', stage:'sites-hunt-24906', host:'ina-wp-12733', x:650, y:419,
   beyond:'sites-hunt-24906-pocket-1', pocketScenery:'inaMirrorSanctum'},
]);
