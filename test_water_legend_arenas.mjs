import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {displayedTierHash} from './tools/browser_scenery_tier.mjs';

const read=async file=>JSON.parse(await fs.readFile(file,'utf8'));
const graph=await read('content/story-graph.json');
const bosses=(await read('content/field-boss-spawns.json')).fieldBosses.filter(b=>b.controller==='waterLegend');
const scenes=new Map();
for(const manifest of (await fs.readdir('assets')).filter(f=>f.endsWith('-background-generation.json'))){
 const data=await read('assets/'+manifest);
 for(const r of data.scenes??[]){
  for(const node of [r.node,...r.sharedNodes??[]]){
   scenes.set(node,{...r,report:manifest.replace('-background-generation.json','-background-compression.json')});
  }
 }
}
const browser=await chromium.launch({channel:'chrome',args:['--disable-accelerated-2d-canvas']});
try{
 const base=process.env.LAB_URL||'http://127.0.0.1:9117/';
 const page=await browser.newPage();
 const errors=[],results=[],pictures=[];
 page.on('pageerror',e=>errors.push(e.message));
 const phases=bosses.map(b=>({node:b.node,name:b.name}));
 const shifted=graph.nodes.find(n=>n.locationAfterReport && bosses.some(b=>b.node===n.id));
 phases.push({node:shifted.id,name:shifted.locationAfterReport.name,after:true,alias:'morte-tower-sluice'});
 for(const id of ['iron-viscount-thermal-gallery','erinnyes-root-waterway','morte-tower-sluice']){
  phases.push({node:id,name:graph.nodes.find(n=>n.id===id).name,approach:true});
 }
 for(const {node,name,after,alias,approach} of phases){
  const expected=scenes.get(alias??node);
  await page.goto(base+'map-art.html?placements=live&compare=background&tier=4096&arena=waterLegend&measured=1&node='+node+(after?'&phase=after':''));
  await page.waitForFunction(f=>window.mapArt?.backgroundFile===f&&window.mapArt.decodedBackgroundRectangles===4096,expected.source);
  if(!results.length){
   const selected=await page.locator('#nodeSearchResults [data-node]').evaluateAll(els=>els.map(el=>el.dataset.node).sort());
   assert.deepEqual(selected,bosses.map(b=>b.node).sort());
  }
  const {shownCount}=await page.evaluate(()=>window.mapArt);
  let sprite;
  if(!approach){
   const open=await read('work/group-legend-openings/'+node+'.json');
   assert.ok(open.swimming);assert.equal(shownCount,open.png.filter(d=>d.kind==='boss_sprite').length);
   await page.uncheck('#matchSpritePng');
   await page.selectOption('#profile','h32c16');
   await page.locator('#measureSprite').click();
   const shape=JSON.parse(await page.locator('#spriteFidelity').getAttribute('data-result'));
   assert.ok(shape.overlap>0);
   sprite={shape,standardRectangles:open.legacy.filter(d=>d.kind==='rect').length,
    lightRectangles:open.h32c16.filter(d=>d.kind==='rect').length};
   await page.check('#matchSpritePng');
  }
  const tiers={};
  const report=await read('evidence/'+(expected.report==='fon-beryl-background-compression.json'?'beryl-background-compression.json':expected.report));
  for(const {rectangles:n,rgbSha256} of [...report.scenes[expected.source].tiers].reverse()){
   await page.selectOption('#backgroundTier',String(n));
   await page.waitForFunction(n=>window.mapArt.decodedBackgroundRectangles===n,n);
   const link=page.locator('#sceneryDownload[download="'+expected.source.replace('-background-v1.png','-'+n+'.lua')+'"]');
   await link.waitFor();tiers[n]=await link.evaluate(async a=>(await(await fetch(a.href)).blob()).size);
   assert.equal(await displayedTierHash(page,n),rgbSha256);
  }
  if(after){
   const next=page.locator('#placementViewLink');assert.equal(new URL(await next.getAttribute('href'),base).searchParams.get('phase'),'after');
   await page.selectOption('#sceneryPhase','before');
   await page.waitForFunction(()=>window.mapArt.backgroundFile==='morte-bubble-room-background-v1.png');
   await page.selectOption('#sceneryPhase','after');
   await page.waitForFunction(()=>window.mapArt.backgroundFile==='bygone-resonance-background-v1.png' && window.mapArt.decodedBackgroundRectangles===4096);
  }
  if(!approach)pictures.push({name,images:await page.evaluate(()=>['png','rect'].map(id=>document.getElementById(id).toDataURL()))});
  results.push({node,name,afterReport:Boolean(after),source:expected.source,openingParts:shownCount,sprite,tiers});
 }
 assert.deepEqual(errors,[]);
 const contact=await page.evaluate(async rows=>{
  const canvas=document.createElement('canvas');canvas.width=1040;canvas.height=34+rows.length*229;
  const g=canvas.getContext('2d');g.fillStyle='#102833';g.fillRect(0,0,canvas.width,canvas.height);
  g.fillStyle='#ecf7ed';g.font='bold 17px "Yu Gothic UI",sans-serif';g.fillText('元の背景',10,23);g.fillText('4,096矩形の背景（キャラは左右とも元絵）',527,23);
  for(const [i,row] of rows.entries()){
   const y=34+i*229;g.fillText(row.name,10,y+17);
   for(const [j,url] of row.images.entries()){
    const im=new Image();im.src=url;await im.decode();
    g.drawImage(im,0,86,960,382,8+j*518,y+22,506,201);
   }
  }
  return canvas.toDataURL();
 },pictures);
 await fs.writeFile('evidence/water-legend-arenas-comparison.png',Buffer.from(contact.split(',')[1],'base64'));
 await fs.writeFile('evidence/water-legend-arenas-browser.json',JSON.stringify({results},null,2)+'\n');
 console.log(results.length+' arena, phase and approach views with five matching Lua tiers each.');
}finally{await browser.close()}
