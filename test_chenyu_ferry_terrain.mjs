import {chromium} from 'playwright';
import {testDomainTerrain} from './tools/browser_domain_terrain_test.mjs';

const fields = [
  [64840,'peak',419],
  [64841,'ridge',417,'chenyuRainCatch',382],
  [64842,'river',430,'chenyuWindArch',400],
  [64844,'ferry',428,'chenyuSailLoft',405],
].map(([number,name,y,scenery,height]) => {
  const stage = 'branch-hunt-' + number;
  const room = stage + '-pocket-1';
  return {name,stage,host:'liyue-wp-'+number,x:690,y,beyond:scenery ? room : undefined,
    detours:scenery ? [{id:room,scenery}] : [],
    pocketRoles:scenery ? [[room,'optional_elite',height]] : []};
});
await testDomainTerrain(chromium,{prefix:'chenyu-ferry',hub:'chenyu-camp',uniqueBackgrounds:true,compareBackgrounds:true},fields);
