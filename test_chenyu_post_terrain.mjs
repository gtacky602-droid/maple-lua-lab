import {chromium} from 'playwright';
import {testDomainTerrain} from './tools/browser_domain_terrain_test.mjs';

const fields = [
  [64834,'inn',424, [['chenyuPostQuarry',400]]],
  [64835,'tea',420, [['chenyuCascade',386],['chenyuShale',480]]],
  [64836,'east',417, [['chenyuWillowDen',400],['chenyuPebbleBed',480]]],
  [64838,'harbor',426, []],
  [64839,'ridge',416, [['chenyuStonehelm',379]]],
].map(([n,name,y,rooms]) => {
  const stage = 'branch-hunt-' + n;
  const detours = rooms.map(([scenery],i) => ({id:stage+'-pocket-'+(i+1),scenery}));
  const pocketRoles = rooms.map(([,height],i) => [detours[i].id,i===0?'optional_elite':'rare_pocket',height]);
  return {name,stage,host:'liyue-wp-'+n,x:690,y,beyond:detours[0]?.id,detours,pocketRoles};
});
await testDomainTerrain(chromium,{prefix:'chenyu-post',hub:'chenyu-camp',uniqueBackgrounds:true,compareBackgrounds:true},fields);
