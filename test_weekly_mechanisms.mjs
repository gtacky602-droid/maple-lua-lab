import {compareOpeningPixels} from './tools/browser_opening_pixels.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const base=process.env.LAB_URL||'http://127.0.0.1:9117/';
const scenes=JSON.parse(await fs.readFile('content/weekly-opening-parts.json','utf8'));
const nodes=JSON.parse(await fs.readFile('content/story-graph.json','utf8')).nodes;
const browser=await chromium.launch({channel:'chrome',args:['--disable-accelerated-2d-canvas']});
const report={};
try{
 for(const [id,scene] of Object.entries(scenes)){
  const page=await browser.newPage({viewport:{width:1420,height:920}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const node=nodes.find(n=>n.id===id);
  const refs=JSON.parse(await fs.readFile('work/weekly-mechanisms/'+id+'.json','utf8'));
  await page.goto(base+'map-art.html?placements=live&background=original&node='+id);
  await page.waitForFunction(n=>window.mapArt?.count===n&&window.mapArt.backgroundState==='ready',scene.parts.length);
  const parts=await page.evaluate(()=>window.mapArt.placements);
  assert.deepEqual(parts,scene.parts.map(({id,species,x,y,flip})=>({id,species,x,y,flip})));
  const pixels={};
  for(const profile of ['legacy','h48c32','h32c16']){
   await page.selectOption('#profile',profile);
   const result=await compareOpeningPixels(page,refs.png,refs[profile],node);
   assert.deepEqual(result,{png:0,rect:0},id+' '+profile+' '+JSON.stringify(result));
   const rectangles=refs[profile].filter(d=>d.kind==='rect').length;
   assert.ok((await page.locator('#viewportCost').innerText()).includes(rectangles.toLocaleString('ja-JP')+'個'));
   pixels[profile]={rectangles,differentPixels:result};
  }
  if(scene.parts.length>1){
   for(const part of scene.parts){
    await page.selectOption('#liveSubject',part.id);
    assert.equal(await page.evaluate(()=>window.mapArt.shownCount),1);
   }
   await page.selectOption('#liveSubject','');
  }
  await page.locator('main').screenshot({path:'evidence/'+id+'-mechanisms.png'});
  assert.deepEqual(errors,[]);
  report[id]={parts,profiles:pixels};
  await page.close();console.log(id);
 }
 await fs.writeFile('evidence/weekly-mechanism-placements.json',JSON.stringify(report,null,2)+'\n');
}finally{await browser.close()}
