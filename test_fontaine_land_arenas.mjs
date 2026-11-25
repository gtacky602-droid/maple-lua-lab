import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {displayedTierHash} from './tools/browser_scenery_tier.mjs';

const read=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const {scenes}=await read('assets/fontaine-land-legends-background-generation.json');
const {scenes:encoded}=await read('evidence/fontaine-land-legends-background-compression.json');
const {items:gallery}=await read('content/boss-art-gallery.json');
const {fieldBosses}=await read('content/field-boss-spawns.json');
const graph=await read('content/story-graph.json');
const nodes=new Map(graph.nodes.map(n=>[n.id,n]));
const region='フォンテーヌ';
const expected=fieldBosses.filter(b=>b.id.startsWith('legend-')&&nodes.get(b.node).region===region).map(b=>b.node).sort();
const browser=await chromium.launch({channel:'chrome',args:['--disable-accelerated-2d-canvas']});
try{
 const base=process.env.LAB_URL||'http://127.0.0.1:9117/';
 const page=await browser.newPage({viewport:{width:1440,height:920}});
 const results=[],pictures=[],candidates=[],errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 for(const {node,source} of scenes){
  const query=new URLSearchParams({placements:'live',node,region,arena:'legend',measured:'1',compare:'background',tier:'4096'});
  await page.goto(base+'map-art.html?'+query);
  await page.waitForFunction(source=>window.mapArt?.backgroundFile===source&&window.mapArt.decodedBackgroundRectangles===4096,source);
  assert.equal(await page.locator('#nodeRegion').inputValue(),region);
  const actual=await page.locator('#nodeSearchResults [data-node]').evaluateAll(els=>els.map(el=>el.dataset.node).sort());
  assert.deepEqual(actual,expected);
  assert.match(await page.locator('#context').textContent(),/地方伝説の任意戦/);
  const boss=fieldBosses.find(b=>b.node===node);
  const baseline=await page.evaluate(()=>window.mapArt.visuals[0]);
  const candidate=gallery.find(i=>i.candidateFor===boss.id);
  const tiers={};
  for(const tier of [...encoded[source].tiers].reverse()){
   const n=tier.rectangles;
   await page.selectOption('#backgroundTier',String(n));
   await page.waitForFunction(n=>window.mapArt.decodedBackgroundRectangles===n,n);
   const link=page.locator('#sceneryDownload[download="'+source.replace('-background-v1.png','-'+n+'.lua')+'"]');
   await link.waitFor();
   tiers[n]=await link.evaluate(async a=>(await(await fetch(a.href)).blob()).size);
   assert.equal(await displayedTierHash(page,n),tier.rgbSha256);
  }
  const access=page.locator('#legendAccess');
  const gated=node==='deianeira-legend-lab';
  assert.equal(await access.isVisible(),gated);
  if(gated){
   await access.locator('summary').click();
   assert.match(await access.innerText(),/水洞の奥の圧力扉.*94/);
   assert.equal(new URL(await access.locator('a').getAttribute('href'),base).searchParams.get('node'),'fon-wp-55768');
  }
  pictures.push({name:boss.name,images:await page.evaluate(()=>['png','rect'].map(id=>document.getElementById(id).toDataURL()))});
  const control=page.locator('#candidateIdle');
  assert.equal(await control.isVisible(),Boolean(candidate));
  let preview;
  if(candidate){
   await page.uncheck('#matchSpritePng');await page.selectOption('#profile','h32c16');
   const capture=()=>page.locator('#rect').evaluate(c=>c.toDataURL());
   const before=await capture();await control.check();
   const asset=await read('assets/'+candidate.file);
   const current=await page.evaluate(()=>window.mapArt.visuals[0]);
   assert.equal(current.source,asset.source);assert.equal(current.height,baseline.height);assert.equal(current.y,baseline.y);
   const shared=page.locator('#sharedLegendArt');
   await shared.locator('summary').click();await shared.locator('canvas').first().waitFor();
   candidates.push({name:boss.name,images:[before,await capture()]});
   await page.locator('#measureSprite').click();
   preview={source:current.source,shape:JSON.parse(await page.locator('#spriteFidelity').getAttribute('data-result'))};
   assert.ok(preview.shape.overlap>0);
   await control.uncheck();assert.deepEqual(await page.evaluate(()=>window.mapArt.visuals[0]),baseline);
  }
  results.push({node,name:boss.name,source,tiers,opening:baseline,preview});
 }
 assert.deepEqual(errors,[]);
 const image=await page.evaluate(async rows=>{
  const c=document.createElement('canvas');c.width=1000;c.height=35+rows.length*302;
  const ctx=c.getContext('2d');ctx.fillStyle='#192d30';ctx.fillRect(0,0,c.width,c.height);
  ctx.fillStyle='#f6f1df';ctx.font='bold 17px "Yu Gothic UI",sans-serif';
  ctx.fillText('元の背景',8,22);ctx.fillText('4,096矩形の背景（キャラは左右とも元絵）',507,22);
  for(const [i,row] of rows.entries()){
   const y=34+i*302;ctx.fillText(row.name,8,y+18);
   for(const [j,url] of row.images.entries()){
    const im=new Image();im.src=url;await im.decode();ctx.drawImage(im,8+j*498,y+23,486,274);
   }
  }
  return c.toDataURL();
 },pictures);
 await fs.writeFile('evidence/fontaine-land-arenas-comparison.png',Buffer.from(image.split(',')[1],'base64'));
 const detail=await page.evaluate(async rows=>{
  const c=document.createElement('canvas');c.width=760;c.height=42+rows.length*268;
  const ctx=c.getContext('2d');ctx.imageSmoothingEnabled=false;
  ctx.fillStyle='#192d30';ctx.fillRect(0,0,c.width,c.height);ctx.fillStyle='#f6f1df';
  ctx.font='bold 18px "Yu Gothic UI",sans-serif';
  ctx.fillText('本編の待機絵・16色',12,26);ctx.fillText('通常の従者と共用する候補・16色',388,26);
  for(const [i,row] of rows.entries()){
   const y=42+i*268;ctx.fillText(row.name,10,y+19);
   for(const [j,data] of row.images.entries()){
    const im=new Image();im.src=data;await im.decode();
    ctx.drawImage(im,369,350,222,146,8+j*378,y+23,366,240);
   }
  }
  return c.toDataURL();
 },candidates);
 await fs.writeFile('evidence/fontaine-operative-stage-candidates.png',Buffer.from(detail.split(',')[1],'base64'));
 await fs.writeFile('evidence/fontaine-land-arenas-browser.json',JSON.stringify({region,measured:expected,results},null,2)+'\n');
 console.log(expected.length+' regional arenas, five locations, 25 Lua tiers and both alternate operative poses verified.');
}finally{await browser.close()}
