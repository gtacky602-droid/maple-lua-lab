import {displayedTierHash} from './tools/browser_scenery_tier.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const read=async file=>JSON.parse(await fs.readFile(file,'utf8'));
const {scenes}=await read('assets/field-final-arenas-background-generation.json');
const {scenes:encoded}=await read('evidence/field-final-arenas-background-compression.json');
const {fieldBosses}=await read('content/field-boss-spawns.json');
const graph=await read('content/story-graph.json');
const {quests}=graph;
const openings=await read('content/field-boss-openings.json');
const browser=await chromium.launch({channel:'chrome',args:['--disable-accelerated-2d-canvas']});
try {
 const base=process.env.LAB_URL||'http://127.0.0.1:9117/';
 const game=await browser.newPage({viewport:{width:1440,height:920}});
 const errors=[],results=[],pictures=[];
 await game.goto(base);
 const frames=await read('work/normal-arena-frames.json');
 const expected={};
 for(const file of await fs.readdir('assets')){
  if(!file.endsWith('-background-generation.json'))continue;
  for(const scene of (await read('assets/'+file)).scenes??[]){
   for(const node of [scene.node,...scene.sharedNodes??[]]){
    if(Object.hasOwn(frames,node))expected[node]=scene.source;
   }
  }
 }
 const normalPlay=await game.evaluate(async({frames,graph})=>{
  const {sceneryKey,sceneryDefinitions}=await import('./scenery.js');
  return Object.fromEntries(Object.entries(frames).map(([node,frame])=>{
   const def=sceneryDefinitions[sceneryKey({...frame,storyGraph:graph})];
   if(!def.decodedTiers||!def.decodedPreview)throw Error(node+' has no decoded backdrop');
   return [node,def.file];
  }));
 },{frames,graph});
 assert.deepEqual(Object.keys(normalPlay).sort(),fieldBosses.filter(b=>!b.id.startsWith('legend-')).map(b=>b.node).sort());
 assert.deepEqual(normalPlay,expected);
 await game.getByRole('button',{name:'本編ルートへ',exact:true}).click();
 await game.waitForFunction(()=>window.lab?.frame.story.active);
 await game.keyboard.press('KeyM');
 for(const {node,source,key} of scenes){
  await game.bringToFront();
  await game.locator('#atlasWorld').evaluate(button=>{if(!button.disabled)button.click()});
  await game.waitForFunction(()=>window.lab.frame.worldMap?.region==='world');
  await game.selectOption('#atlasLayer','boss');
  await game.waitForFunction(()=>window.lab.frame.worldMap?.layer==='boss');
  await game.selectOption('#atlasField',node);
  const link=game.locator('#atlasBackgroundCompare[href*="'+node+'"]');
  const [page]=await Promise.all([game.waitForEvent('popup'),link.click()]);
  page.on('pageerror',e=>errors.push(e.message));
  await page.waitForFunction(node=>window.mapArt?.ready&&window.mapArt.node===node&&window.mapArt.backgroundState==='ready',node);
  const state=await page.evaluate(()=>window.mapArt);
  assert.equal(state.background,key);
  assert.equal(state.backgroundFile,source);
  assert.equal(state.shownCount,openings[node].parts.length);
  const name=fieldBosses.find(b=>b.node===node).name;
  if(!results.length){
   if(!await page.locator('#mapNodePicker').evaluate(el=>el.open))await page.locator('#mapNodePicker summary').click();
   for(const kind of ['normal','legend']){
    await page.selectOption('#nodeArenaFilter',kind);
    await page.uncheck('#nodeMeasuredFilter');
    const listed=()=>page.locator('#nodeSearchResults [data-node]').evaluateAll(els=>els.map(el=>el.dataset.node).sort());
    const expected=fieldBosses.filter(b=>b.id.startsWith('legend-')===(kind==='legend')).map(b=>b.node).sort();
    assert.deepEqual(await listed(),expected);
    await page.check('#nodeMeasuredFilter');
    if(kind==='normal')assert.deepEqual(await listed(),expected);
   }
  }
  await page.check('#decodedBackground');
  await page.check('#matchSpritePng');
  const localSteps=quests.flatMap(q=>{
   const steps=(q.itinerary??[]).flatMap((s,i)=>s.node===node?[{number:i+1,objective:s.objective}]:[]);
   return steps.length?[{quest:q.name,steps}]:[];
  });
  const panel=page.locator('#localQuestSteps');
  assert.equal(await panel.isVisible(),localSteps.length>0);
  if(localSteps.length){
   await panel.locator('summary').click();
   const shown=await panel.locator('strong').evaluateAll(titles=>titles.map(t=>({
    quest:t.textContent,steps:[...t.nextElementSibling.children].map(li=>({number:li.value,objective:li.textContent}))
   })));
   assert.deepEqual(shown,localSteps);
  }
  const tiers={};
  for(const tier of [...encoded[source].tiers].reverse()){
   const n=tier.rectangles;
   await page.selectOption('#backgroundTier',String(n));
   await page.waitForFunction(n=>window.mapArt.decodedBackgroundRectangles===n,n);
   const filename=source.replace('-background-v1.png','-'+n+'.lua');
   const anchor=page.locator('#sceneryDownload[download="'+filename+'"]');
   await anchor.waitFor();
   tiers[n]=await anchor.evaluate(async a=>(await(await fetch(a.href)).blob()).size);
   const hash=await displayedTierHash(page,n);
   assert.equal(hash,tier.rgbSha256);
  }
  pictures.push({name,images:await page.evaluate(()=>['png','rect'].map(id=>document.getElementById(id).toDataURL()))});
  results.push({node,name,source,opening:state.visuals.length,localSteps,tiers});
  await page.close();
 }
 assert.deepEqual(errors,[]);
 const contact=await game.evaluate(async shots=>{
  const c=document.createElement('canvas');c.width=1000;c.height=36+shots.length*301;
  const ctx=c.getContext('2d');ctx.fillStyle='#172a30';ctx.fillRect(0,0,c.width,c.height);
  ctx.fillStyle='#f6f1dd';ctx.font='bold 17px "Yu Gothic UI",sans-serif';
  ctx.fillText('元の背景',10,24);ctx.fillText('4,096矩形の背景（同じボスを表示）',508,24);
  for(const [i,row] of shots.entries()){
   const y=36+i*301;ctx.fillText(row.name,10,y+17);
   for(const [j,data] of row.images.entries()){
    const image=new Image();image.src=data;await image.decode();ctx.drawImage(image,8+j*498,y+23,486,273);
   }
  }
  return c.toDataURL();
 },pictures);
 await fs.writeFile('evidence/field-final-arenas-comparison.png',Buffer.from(contact.split(',')[1],'base64'));
 await fs.writeFile('evidence/field-final-arenas-browser.json',JSON.stringify({normalPlay,results},null,2)+'\n');
 console.log('Verified normal and legend filters, five atlas entrances, matching boss poses and 25 backdrop tiers.');
} finally { await browser.close(); }
