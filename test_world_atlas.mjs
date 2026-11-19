import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';

const browser = await chromium.launch({headless:true, channel:'chrome'});
const page = await browser.newPage({viewport:{width:1280,height:900}});
const errors = [];
const atlas = page.locator('#worldAtlas');
const map = () => page.evaluate(() => window.lab.frame.worldMap);
const area = (region, layer) => page.waitForFunction(([region,layer]) => {
 const atlas = window.lab?.frame.worldMap;
 return atlas?.region === region && (!layer || atlas.layer === layer);
}, [region,layer]);
page.on('pageerror', error => errors.push(error.message));

try {
 await page.goto(process.env.LAB_URL || 'http://127.0.0.1:8973/');
 await page.getByRole('button', {name:'本編ルートへ', exact:true}).click();
 await page.waitForFunction(() => window.lab?.frame.story.active);
 await page.keyboard.press('KeyM');
 await atlas.waitFor();
 await area('region-01','all');
 const start = await map();
 assert.equal(start.selected.id,'mond-town');
 assert.equal(start.options.some(option => option.id==='hidden-01'),false);
 assert.ok(start.routes.some(route => route.id==='mond-road'));
 await page.locator('#atlasField').selectOption('mond-road');
 await page.waitForFunction(()=>window.lab.frame.worldMap?.selected?.id==='mond-road');
 const guide=(await map()).guide;
 assert.equal(guide.status,'ready');
 assert.deepEqual(guide.stops.map(stop=>stop.id),['mond-road']);
 assert.equal(await page.locator('#atlasItinerary').getAttribute('open'),'');
 await page.locator('#atlasItineraryStops button').filter({hasText:'徒歩'}).waitFor();
 const tick = await page.evaluate(() => window.lab.frame.t);
 await page.keyboard.press('KeyD');
 await page.keyboard.press('KeyJ');
 await page.locator('#atlasWorld').click();
 await area('world');
 assert.equal(await page.evaluate(() => window.lab.frame.t),tick);
 assert.equal((await map()).points.length,8);
 await atlas.screenshot({path:'evidence/world-atlas-overview.png'});

 const world=await map();
 const fontaine=world.points.find(point=>point.id==='region-05');
 const canvas=page.locator('#atlasCanvas');
 const box=await canvas.boundingBox();
 await canvas.click({position:{x:fontaine.x*box.width/world.width,y:fontaine.y*box.height/world.height}});
 await area('region-05');
 await page.locator('#atlasLayer').selectOption('water');
 await area('region-05','water');
 assert.ok((await map()).points.every(point=>point.layer==='water'));
 await page.locator('#atlasLayer').selectOption('all');
 await area('region-05','all');
 await page.locator('#atlasSearch').fill('船');
 assert.ok(await page.locator('#atlasField option').count()>1);
 await page.locator('#atlasSearch').fill('');
 await page.locator('#atlasField').selectOption('fontaine-hub');
 await page.waitForFunction(()=>window.lab.frame.worldMap.selected?.id==='fontaine-hub');
 await atlas.screenshot({path:'evidence/world-atlas-fontaine.png'});

 await page.locator('#atlasCurrent').click();
 await area('region-01','all');
 await page.locator('#atlasRegion').selectOption('branch-06');
 await area('branch-06','all');
 await page.locator('#atlasLayer').selectOption('surface');
 await area('branch-06','surface');
 await page.locator('#atlasField').selectOption('sites-lookout-98500');
 await page.waitForFunction(()=>window.lab.frame.worldMap.selected?.id==='sites-lookout-98500');
 assert.match((await map()).selected.name,/山風の荊冠/);
 await page.locator('#atlasRoutes button').filter({hasText:/滝のふもと.*風の流れ/}).click();
 await page.waitForFunction(()=>window.lab.frame.worldMap.selected?.id==='sites-windcrown-waterfall');
 await page.locator('#atlasRoutes button').filter({hasText:'半島の神像'}).click();
 await page.waitForFunction(()=>window.lab.frame.worldMap.selected?.id==='mond-wp-95782');
 await page.locator('#atlasCurrent').click();
 await area('region-01','all');
 await page.setViewportSize({width:390,height:844});
 assert.equal(await atlas.evaluate(el=>el.scrollWidth>el.clientWidth),false);
 await atlas.screenshot({path:'evidence/world-atlas-mobile.png'});
 await page.keyboard.press('Escape');
 await atlas.waitFor({state:'hidden'});
 await page.waitForFunction(tick=>window.lab.frame.t>tick,tick);
 await page.locator('#atlasOpen').click();
 await atlas.waitFor();
 await page.keyboard.press('KeyM');
 await atlas.waitFor({state:'hidden'});
 assert.equal(await page.locator('button.skill[data-action="skill3"] kbd').textContent(),'I');
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/world-atlas-browser.json',JSON.stringify({
  openedByKeyAndButton:true,worldRegions:8,currentPosition:true,
  mapClickAndFilter:true,searchAndPlaceSelection:true,itineraryOnCanvasAndPanel:true,hiddenAreaRemoved:true,windcrownExteriorReturn:true,
  keyboardAndTurnRecovery:true,simulationTimeFrozen:true,noMobileOverflow:true,errors
 },null,2)+'\n');
 console.log('Atlas current position, overview, regional and water layers, search, keyboard and mobile passed.');
} catch (error) {
 console.error(await page.evaluate(()=>({
  status:document.querySelector('#status')?.textContent, node:window.lab?.frame.story?.node,
  map:window.lab?.frame.worldMap?.region, layer:window.lab?.frame.worldMap?.layer
 })));
 throw error;
} finally {
 await browser.close();
}
