import { chromium } from 'playwright';
import { testDomainTerrain } from './tools/browser_domain_terrain_test.mjs';

await testDomainTerrain(chromium, { prefix: 'natlan-domain', hub: 'natlan-hub', uniqueBackgrounds: true, compareBackgrounds: true }, [
  { name: 'waterfall', host: 'nat-wp-72414', stage: 'sites-hunt-73159',
    beyond: 'tepeacac-waterfall-wall', fixture: 'natlan-eastern-rooms-fixture.json',
    detours: [{ id: 'tepeacac-waterfall-wall', scenery: 'natFallsCavern' },
      { id: 'sites-hunt-73159-pocket-1', scenery: 'natErodedKiln' },
      { id: 'sites-hunt-73159-pocket-2', scenery: 'natCicinCamp' }], x: 650, y: 421, screenshot: true },
  { name: 'cave', host: 'nat-wp-72422', stage: 'sites-hunt-73160',
    beyond: 'toyac-rainbow-key-cave', pocketScenery: 'natSpringKeyCave', x: 2480, y: 406, screenshot: true },
  { name: 'cliff', host: 'nat-wp-79051', stage: 'sites-hunt-81383',
    beyond: 'sites-hunt-81383-pocket-1', pocketScenery: 'natRangerShelter', x: 2380, y: 394, fixture: 'natlan-western-domain-terrain-fixture.json', screenshot: true },
  { name: 'shore', host: 'nat-wp-82564', stage: 'sites-hunt-82577',
    beyond: 'atocpan-domain-side-clearing', pocketScenery: 'natSouthernClearing', x: 2350, y: 434, fixture: 'natlan-western-domain-terrain-fixture.json', screenshot: true },
  { name: 'central', host: 'nat-wp-72445', stage: 'sites-hunt-73161',
    beyond: 'sites-hunt-73161-pocket-1', pocketScenery: 'natSpiritAlcove', x: 2380, y: 348, fixture: 'natlan-western-domain-terrain-fixture.json', existing: true },
]);
