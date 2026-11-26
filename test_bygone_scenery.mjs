import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {backgroundMeasurements} from './scenery-measurements.js';

const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const base=process.env.LAB_URL || 'http://127.0.0.1:9125/';
const regions=['フォンテーヌ','往日の海'];
const expected=new Map([
 ['fon-wp-50072','thalattaRift'],['fon-wp-55765','thalattaRift'],['bygone-wp-68604','thalattaRift'],
 ['bygone-wp-68600','fontaineSunkenReef'],['bygone-wp-68608','fontaineSunkenReef'],['bygone-wp-68615','fontaineSunkenReef'],
]);
const browser=await chromium.launch({channel:'chrome'});
try{
 const page=await browser.newPage();
 const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 for(const id of ['bygone-camp','bygone-depth']){
  await page.goto(new URL('map-art.html?placements=live&node='+id,base).href);
  await page.waitForFunction(node=>window.mapArt?.ready && window.mapArt.node===node
    && window.mapArt.background==='bygone' && window.mapArt.backgroundState==='ready',id);
 }
 for(const [id,scenery] of expected){
  const node=graph.nodes.find(n=>n.id===id);
  assert.ok(node.swim && regions.includes(node.region));
  const reference=scenery==='thalattaRift'?'swords-of-the-gorge-legend-rift':'sites-hunt-50067';
  assert.ok(backgroundMeasurements[reference]);
  assert.equal(backgroundMeasurements[id],backgroundMeasurements[reference]);
  await page.goto(new URL('map-art.html?placements=live&node='+id+'&tier=4096&compare=background',base).href);
  await page.waitForFunction(key=>window.mapArt?.ready && window.mapArt.background===key &&
     window.mapArt.backgroundState==='ready' && window.mapArt.decodedBackgroundRectangles===4096,scenery);
  const actual=await page.evaluate(()=>window.mapArt);
  assert.equal(actual.node,id);
  assert.equal(actual.backgroundFallback,false);
  if(id==='bygone-wp-68600'||id==='bygone-wp-68604'){
   await page.locator('#rect').screenshot({path:'evidence/'+id+'-swim-background.png'});
  }
 }
 assert.deepEqual(errors,[]);
 console.log('Six underwater route previews loaded with the 4096-rectangle background.');
}finally{await browser.close()}
