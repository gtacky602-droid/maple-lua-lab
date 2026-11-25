import { chromium } from 'playwright';
import { testDomainTerrain } from './tools/browser_domain_terrain_test.mjs';

await testDomainTerrain(chromium, { prefix: 'fontaine-domain', hub: 'fontaine-hub', uniqueBackgrounds: true }, [
  { name: 'inlet', host: 'fon-wp-50035', stage: 'sites-hunt-50034',
    beyond: 'sites-hunt-50034-pocket-1', pocketScenery: 'fontaineBerylSluice', x: 2280, y: 429, screenshot: true },
  { name: 'north-quay', host: 'fon-wp-50056', stage: 'sites-hunt-50057', x: 2280, y: 429 },
  { name: 'sunken-terrace', host: 'fon-wp-50075', stage: 'sites-hunt-50067', x: 700, y: 428, screenshot: true },
  { name: 'sunken-hall', host: 'fon-wp-50066', stage: 'sites-hunt-56792', x: 2280, y: 405 },
  { name: 'sluice', host: 'fon-wp-55763', stage: 'sites-hunt-63738',
    beyond: 'sites-hunt-63738-pocket-1', pocketScenery: 'fontaineMorteValve', x: 2280, y: 407, screenshot: true },
  { name: 'north-cliff', host: 'fon-wp-53867', stage: 'sites-hunt-68347', beyond: 'sites-hunt-68347-pocket-1',
    x: 2280, y: 395, screenshot: true, detours: [
      { id: 'sites-hunt-68347-pocket-1', scenery: 'goldenGrotto' },
      { id: 'sites-hunt-68347-pocket-2', scenery: 'fontaineUnderstage' },
      { id: 'sites-hunt-68347-pocket-3', scenery: 'tideCalibration' },
    ] },
]);
