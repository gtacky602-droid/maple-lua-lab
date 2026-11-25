import {chromium} from 'playwright';
import {testDomainTerrain} from './tools/browser_domain_terrain_test.mjs';

const fields = [
  [64826, 'bank', 402, 378, 'chenyuRootDen'],
  [64827, 'peak', 419, 308, 'chenyuWindLookout'],
  [64828, 'ferry', 417, 480, 'chenyuFloodShrine'],
  [64829, 'pass', 420, 378, 'chenyuFernHollow'],
].map(([id, name, y, gateY, pocketScenery]) => {
  const stage = 'branch-hunt-' + id;
  const beyond = stage + '-pocket-1';
  return {stage, host: 'liyue-wp-' + id, name, x: 690, y, beyond, pocketScenery,
    pocketRoles: [[beyond, 'optional_elite', gateY]]};
});
await testDomainTerrain(chromium, {
  prefix: 'chenyu-west', hub: 'chenyu-camp', uniqueBackgrounds: true, compareBackgrounds: true,
}, fields);
