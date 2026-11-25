import { chromium } from 'playwright';
import { testDomainTerrain } from './tools/browser_domain_terrain_test.mjs';

const routes = [
  { name: 'araumi', field: 12778, waypoint: 47990, x: 650, y: 417, pocketScenery: 'inaThunderVault' },
  { name: 'yougou', field: 12781, waypoint: 12733, x: 650, y: 422, pocketScenery: 'inaRuinWorkshop' },
  { name: 'byakko', field: 12784, waypoint: 12725, x: 2330, y: 421, pocketScenery: 'inaThunderaxeCamp' },
];
await testDomainTerrain(chromium, {
  prefix: 'inazuma-domain', hub: 'inazuma-town', uniqueBackgrounds: true, compareBackgrounds: true,
}, routes.map(({field,waypoint,...route})=>({
  ...route, stage: 'sites-hunt-'+field, host: 'ina-wp-'+waypoint,
  beyond: 'sites-hunt-'+field+'-pocket-1', screenshot: route.name === 'araumi',
})));
