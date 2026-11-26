import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {rectangleCount} from './sprite-layers.js';
const graph=JSON.parse(await readFile('content/story-graph.json','utf8'));
const roster=JSON.parse(await readFile('content/field-boss-spawns.json','utf8')).fieldBosses;
const base=process.env.LAB_URL||'http://127.0.0.1:19745/';
const browser=await chromium.launch({channel:'chrome'});
try{
 const page=await browser.newPage();
 for(const source of graph.nodes){
  const gate=source.exits.find(e=>e.nightTotem==='enter');
  if(!gate)continue;
  const boss=roster.find(b=>b.node===gate.to);
  const params=new URLSearchParams({placements:'live',node:source.id,to:gate.to,gateX:gate.x,gateY:gate.y??480,fixture:'open'});
  await page.goto(new URL('map-art.html?'+params,base).href);
  const gallery=page.locator('#nightTrialArt'),passage=page.locator('#nightTrialPassage a').first();
  await gallery.waitFor();
  const fromPillar=await gallery.getAttribute('href');
  await passage.click();
  await page.waitForFunction(node=>window.mapArt?.ready&&mapArt.node===node,gate.to);
  assert.equal(await gallery.getAttribute('href'),fromPillar);
  await gallery.click();
  await page.waitForFunction(()=>document.querySelector('#result')?.textContent.includes('座標・色番号'));
  assert.equal(await page.locator('#boss').inputValue(),boss.art);
  for(const pose of ['idle','brace','strike']){
   const data=JSON.parse(await readFile('assets/field-packed/'+boss.art+'-field-'+pose+'-sprites-v'+(boss.artRevision??1)+'.json','utf8'));
   await page.selectOption('#pose',pose);
   const counts=['h48c32','h32c16'].map(k=>rectangleCount(data.profiles[k]).toLocaleString('en-US'));
   await page.waitForFunction(([a,b])=>document.querySelector('#result').textContent.includes('32色 '+a+'矩形 → 16色 '+b+'矩形'),counts);
   assert.equal(await page.locator('main canvas:visible').count(),3);
  }
  const back=page.locator('#arenaEntrances a');
  assert.equal(await back.count(),1);
  const url=new URL(await back.evaluate(a=>a.href));
  assert.equal(url.searchParams.get('node'),source.id);
  assert.equal(Number(url.searchParams.get('gateX')),gate.x);
  if(gate.rockSeal)assert.equal(url.searchParams.get('fixture'),'open');
  console.log(boss.name,source.id);
 }
}finally{await browser.close()}
