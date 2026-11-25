import {chromium} from 'playwright';
import {testDomainTerrain} from './tools/browser_domain_terrain_test.mjs';

for (const [prefix,hub,field] of [
  ['chasm-border','liyue-harbor',{name:'quarry',stage:'sites-hunt-24907',host:'liyue-wp-24909',
    x:2300,y:416,beyond:'sites-hunt-24907-pocket-1',pocketScenery:'chasmGeodeDen'}],
  ['nostoi-border','fontaine-hub',{name:'pier',stage:'sites-hunt-68346',host:'fon-wp-68341',
    x:650,y:419,beyond:'sites-hunt-68346-pocket-1',pocketScenery:'nostoiTidalVault'}],
  ['summit-border','mond-town',{name:'summit',stage:'sites-hunt-7164',host:'mond-wp-6609',x:650,y:417}],
]) {
  await testDomainTerrain(chromium,{prefix,hub,compareBackgrounds:true},[field]);
}
