import {chromium} from 'playwright';
import {testDomainTerrain} from './tools/browser_domain_terrain_test.mjs';

const sea=[
  {name:'coral',stage:'branch-hunt-68600',host:'bygone-wp-68600',x:690,y:415},
  {name:'silt',stage:'branch-hunt-68603',host:'bygone-wp-68603',x:690,y:424},
  {name:'seal',stage:'branch-hunt-68607',host:'bygone-wp-68607',x:690,y:407},
];
const valley=[
  {name:'tea',stage:'branch-hunt-64825',host:'liyue-wp-64825',x:690,y:419,
   beyond:'branch-hunt-64825-pocket-1',pocketScenery:'chenyuGateReedPool'},
  {name:'limestone',stage:'branch-hunt-64824',host:'liyue-wp-64824',x:690,y:401,
   beyond:'branch-hunt-64824-pocket-1',pocketRoles:[
     ['branch-hunt-64824-pocket-1','optional_elite',410],
     ['branch-hunt-64824-pocket-2','rare_pocket',392],
     ['branch-hunt-64824-pocket-3','rare_pocket',480],
   ],detours:[
     {id:'branch-hunt-64824-pocket-1',scenery:'chenyuBeastBamboo'},
     {id:'branch-hunt-64824-pocket-2',scenery:'chenyuGuardianSluice'},
     {id:'branch-hunt-64824-pocket-3',scenery:'chenyuSentinelKiln'},
   ]},
];
for(const [prefix,hub,fields] of [['bygone-hunts','bygone-camp',sea],['chenyu-gates','chenyu-camp',valley]]){
  await testDomainTerrain(chromium,{prefix,hub,uniqueBackgrounds:true,compareBackgrounds:true},fields);
}
