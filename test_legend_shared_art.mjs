import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import fs from 'node:fs/promises';

const base=process.env.LAB_URL??'http://127.0.0.1:9117/';
const initial='witztli-tristars-camp';
const cases={
 [initial]:['fatui-skirmisher-cryogunner','fatui-skirmisher-pyroslinger'],
 'cineas-legend-chamber':['primordial-bathysmal-vishap'],
 'vivianne-legend-bank':['tainted-water-spouting-phantasm'],
 'ninianne-legend-bank':['tainted-water-splitting-phantasm'],
 'nod-raskolnikov-upper-ring':['oprichniki-fireblade-shock-trooper'],
 'sky-maha-pavilion-court':['grounded-geoshroom']
};
const browser=await chromium.launch({channel:'chrome'});
try{
 const page=await browser.newPage({viewport:{width:1200,height:900}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'map-art.html?node='+initial+'&placements=live&tier=4096');
 await page.waitForFunction(()=>window.mapArt?.ready);
 const panel=page.locator('#sharedLegendArt');
 await panel.locator('summary').click();
 const ids=()=>panel.locator('a').evaluateAll(links=>links.map(a=>new URL(a.href).searchParams.get('q')));
 const results={};
 for(const [node,expected] of Object.entries(cases)){
  await page.selectOption('#node',node);await panel.waitFor();
  assert.deepEqual(await ids(),expected);
  const canvases=panel.locator('canvas'),first=canvases.first();
  await page.selectOption('#profile','legacy');
  const standard=await first.evaluate(c=>c.toDataURL());
  await page.selectOption('#profile','h32c16');
  assert.notEqual(await first.evaluate(c=>c.toDataURL()),standard);
  results[node]=await panel.locator('figcaption').allTextContents();
  if(node===initial){
   const [gallery]=await Promise.all([page.waitForEvent('popup'),panel.locator('a').first().click()]);
   await gallery.waitForFunction(()=>window.charactersGallery?.ready);
   assert.deepEqual(await gallery.locator('#cards article:not([hidden])').evaluateAll(cards=>cards.map(c=>c.dataset.id)),[expected[0]]);
   await gallery.close();
   await page.selectOption('#liveSubject','boss-97075');await panel.waitFor({state:'hidden'});
   await page.selectOption('#liveSubject','boss-97076');assert.deepEqual(await ids(),[expected[1]]);
   await page.selectOption('#liveSubject','');
  }
  if(node==='vivianne-legend-bank')await panel.screenshot({path:'evidence/vivianne-ordinary-size-comparison.png'});
 }
 await page.selectOption('#node','chassanion-legend-bubble-room');
 await panel.waitFor({state:'hidden'});
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/legend-shared-art-browser.json',JSON.stringify(results,null,2)+'\n');
 console.log('Shared source art: seven ordinary/legend comparisons in six arenas; selection, scale, links and quality checked.');
}finally{await browser.close()}
