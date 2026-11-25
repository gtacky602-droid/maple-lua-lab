import { chromium } from 'playwright';
import { testDomainTerrain } from './tools/browser_domain_terrain_test.mjs';

const routes = [
  { name: 'mushrooms', field: 28751, waypoint: 28749, x: 650, y: 413, pocketScenery: 'sumSporeHollow' },
  { name: 'station', field: 28754, waypoint: 28729, x: 2380, y: 408, pocketScenery: 'sumServiceBay' },
  { name: 'mountain', field: 28755, waypoint: 28726, x: 2380, y: 417, pocketScenery: 'sumSentinelCourt' },
  { name: 'ravine', field: 28757, waypoint: 28717, x: 2380, y: 395, pocketScenery: 'sumCanopyHangar' },
];
await testDomainTerrain(chromium, {
  prefix: 'sumeru-forest', hub: 'sumeru-hub', uniqueBackgrounds: true, compareBackgrounds: true,
}, routes.map(({ field, waypoint, ...route }) => ({
  ...route, stage: 'sites-hunt-' + field, host: 'sum-wp-' + waypoint,
  beyond: 'sites-hunt-' + field + '-pocket-1', screenshot: route.name === 'mushrooms',
})));
