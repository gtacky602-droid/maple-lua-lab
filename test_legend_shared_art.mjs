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
 await page.goto(new URL('/map-art.html?node='+initial+'&placements=live&tier=4096',base).href);
 await page.waitForFunction(()=>window.mapArt?.ready);
 const panel=page.locator('#sharedLegendArt');
 await panel.locator('summary').click();
 const ids=()=>panel.locator('a[href^="enemies-art.html"]').evaluateAll(links=>links.map(a=>new URL(a.href).searchParams.get('q')));
 const results={};
 for(const [node,expected] of Object.entries(cases)){
  await page.selectOption('#node',node);
  await page.waitForFunction(id=>window.mapArt?.ready&&window.mapArt.node===id,node);
  await panel.waitFor();
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
  if(node.endsWith('-legend-bank')){
   const study=panel.locator('.lake-eye-study');
   assert.deepEqual(await study.locator('figcaption').allTextContents(),['元PNG','32色版','16色版']);
   const colors=await study.locator('canvas').evaluateAll(cs=>cs.map(c=>Array.from(c.getContext('2d').getImageData(18,13,1,1).data)));
   for(const [r,g,b,a] of colors)assert(r>140&&g>220&&b>220&&a>220,JSON.stringify(colors));
   assert.equal(await study.locator('a').count(),3);
   await study.screenshot({path:'evidence/'+node+'-eye.png'});
  }
 }
 await page.selectOption('#node','chassanion-legend-bubble-room');
 await panel.waitFor({state:'hidden'});
 assert.deepEqual(errors,[]);
 await page.goto(new URL('/map-art.html?node=ninianne-legend-bank&placements=live#sharedLegendArt',base).href);
 await panel.locator('.eye-crops canvas').first().waitFor();
 assert(await panel.evaluate(el=>el.open));
 await fs.writeFile('evidence/legend-shared-art-browser.json',JSON.stringify(results,null,2)+'\n');
 console.log('Shared source art: seven ordinary/legend comparisons in six arenas; selection, scale, links and quality checked.');
}finally{await browser.close()}
