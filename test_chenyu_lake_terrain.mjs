import {chromium} from 'playwright';
import {testDomainTerrain} from './tools/browser_domain_terrain_test.mjs';

const fields = [
  [64830, 'grass', 418, 402, 'chenyuAmberHollow'],
  [64831, 'pier', 424, 480, 'chenyuReedIsland'],
  [64832, 'aqueduct', 418, 394, 'chenyuCulvert'],
  [64833, 'tea', 417, 404, 'chenyuTeaStore'],
].map(([id, name, y, gateY, pocketScenery]) => {
  const stage = 'branch-hunt-' + id;
  const beyond = stage + '-pocket-1';
  return {stage, host:'liyue-wp-' + id, name, x:690, y, beyond, pocketScenery,
    pocketRoles:[[beyond, 'optional_elite', gateY]]};
});
await testDomainTerrain(chromium, {
  prefix:'chenyu-lake', hub:'chenyu-camp', uniqueBackgrounds:true, compareBackgrounds:true,
}, fields);
