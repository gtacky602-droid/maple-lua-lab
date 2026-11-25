import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {compareOpeningPixels} from './tools/browser_opening_pixels.mjs';

const read=async path=>JSON.parse(await fs.readFile(path,'utf8'));
const graph=await read('content/story-graph.json');
const base=process.env.LAB_URL||'http://127.0.0.1:9117/';
const browser=await chromium.launch({channel:'chrome',args:['--disable-accelerated-2d-canvas']});
const report={};
try{
 const atlas=await browser.newPage({viewport:{width:1280,height:900}});
 await atlas.goto(base);
 await atlas.getByRole('button',{name:'本編ルートへ',exact:true}).click();
 await atlas.waitForFunction(()=>window.lab?.frame.story.active);
 await atlas.keyboard.press('KeyM');
 for(const name of ['ninianne','vivianne']){
  const id=name+'-legend-bank', node=graph.nodes.find(n=>n.id===id);
  const ref=await read('work/land-legend-openings/'+id+'.json');
  await atlas.locator('#atlasWorld').click();
  await atlas.locator('#atlasLayer').selectOption('boss');
  await atlas.locator('#atlasSearch').fill(name==='ninianne'?'濁水粉砕の幻霊':'濁水噴出の幻霊');
  await atlas.locator('#atlasField').selectOption(id);
  const link=atlas.locator('#atlasBackgroundCompare[href*="'+id+'"]');
  const [page]=await Promise.all([atlas.waitForEvent('popup'),link.click()]);
  await page.waitForFunction(n=>window.mapArt?.node===n&&window.mapArt.count===1&&window.mapArt.backgroundState==='ready',id);
  const placed=await page.evaluate(()=>window.mapArt.placements[0]);
  assert.equal(placed.species,'boss-lake-'+name+'-idle-v5-a');
  assert.deepEqual([placed.x,placed.y,placed.flip],[ref.png[0].x+ref.camera,ref.png[0].y,ref.png[0].flip]);
  const setCamera=async value=>page.locator('#camera').evaluate((el,v)=>{el.value=v;el.dispatchEvent(new Event('input'))},value);
  const centered=await page.locator('#camera').inputValue();
  await page.uncheck('#matchSpritePng');
  await page.uncheck('#decodedBackground');
  await setCamera(ref.camera);
  const profiles={};
  for(const profile of ['legacy','h48c32','h32c16']){
   await page.selectOption('#profile',profile);
   const diff=await compareOpeningPixels(page,ref.png,ref[profile],node,ref.camera);
   assert.deepEqual(diff,{png:0,rect:0},name+' '+profile+' '+JSON.stringify(diff));
   profiles[profile]={rectangles:ref[profile].length,differentPixels:diff};
  }
  await setCamera(centered);
  await page.check('#decodedBackground');
  await page.selectOption('#backgroundTier','4096');
  await page.waitForFunction(()=>window.mapArt.decodedBackgroundRectangles===4096);
  await page.locator('#rect').screenshot({path:'evidence/'+id+'-4096.png'});
  report[id]={source:ref.png[0].source,artHeight:ref.png[0].h,firstVisibleTick:ref.ticks,profiles};
  await page.close();
 }
 await fs.writeFile('evidence/lake-bank-openings-browser.json',JSON.stringify(report,null,2)+'\n');
 console.log(report);
}finally{await browser.close()}
