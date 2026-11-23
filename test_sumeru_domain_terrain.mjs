import { chromium } from 'playwright';
import { testDomainTerrain } from './tools/browser_domain_terrain_test.mjs';

await testDomainTerrain(chromium, { prefix: 'sumeru-domain', hub: 'sumeru-hub' }, [
  { name: 'red-sand', host: 'sum-wp-36683', stage: 'sites-hunt-36703',
    beyond: 'sites-hunt-36703-pocket-1', x: 2380, y: 387, pocketScenery: 'asimonField' },
  { name: 'royal-tomb', host: 'sum-wp-36691', stage: 'sites-hunt-36704',
    beyond: 'sites-hunt-36704-pocket-1', x: 2380, y: 400, pocketScenery: 'wenutField', screenshot: true },
  { name: 'dunes', host: 'sum-wp-36697', stage: 'sites-hunt-36705',
    beyond: 'sites-hunt-36705-pocket-1', x: 2380, y: 348, pocketScenery: 'asimonField' },
  { name: 'east-desert', host: 'sum-wp-36680', stage: 'sites-hunt-41694',
    beyond: 'sites-hunt-41694-pocket-1', x: 2380, y: 420, pocketScenery: 'asimonField' },
  { name: 'north-tunnel', host: 'sum-wp-41836', stage: 'sites-hunt-41817',
    beyond: 'sites-hunt-41817-pocket-1', x: 2380, y: 375, pocketScenery: 'wenutField', screenshot: true },
  { name: 'east-basin', host: 'sum-wp-41839', stage: 'sites-hunt-41818',
    x: 650, y: 431, screenshot: true },
]);
