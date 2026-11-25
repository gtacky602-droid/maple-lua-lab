import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {captureFrozenStage} from './tools/frozen-stage-capture.mjs';
const early=process.argv.includes('--at-station');
const base=process.env.LAB_URL||'http://127.0.0.1:9118/';
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1080,height:850}});
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
try{
 await page.goto(base);
 await page.waitForFunction(()=>window.lab?.frame);
 const regions=['MON','LIY','INA','SUM','FON','NAT','NOD','SNE'];
 const files=['evidence/snez-revisit-save.json',early?'work/regional-chapters-station.json':'evidence/regional-chapters-save.json'];
 const counts=[];
 for(const [i,file] of files.entries()){
  await page.locator('#importSave').setInputFiles(file);
  const total=i?64:61;
  await page.waitForFunction(done=>window.lab?.frame?.story?.node==='white-pass-station'&&
   Boolean(window.lab.frame.story.quests['mond-return-box-quest']?.status==='complete')===done,Boolean(i));
  await page.selectOption('#questFilter','chapter:pending');
  await page.waitForFunction(n=>document.querySelector('#chapterProgress')?.textContent.includes(n+' / 64件'),total);
  const rows=page.locator('#questJournal [data-quest]');
  if(!i){
   const ids=await rows.evaluateAll(els=>els.map(e=>e.dataset.quest).sort());
   assert.deepEqual(ids,['liyue-stone-marks','mond-night-banner-quest','mond-return-box-quest']);
   await rows.locator('button').filter({hasText:'受注・報告場所を地図で見る'}).first().click();
   await page.waitForFunction(()=>window.lab.frame.worldMap?.selected?.id==='mond-town');
   await page.evaluate(()=>window.lab.action('world_map_close'));
   await page.waitForFunction(()=>!window.lab.frame.worldMap);
  }else{
   assert.equal(await rows.count(),0);
   await page.locator('#questJournal').screenshot({path:early?'work/regional-chapters-journal.png':'evidence/regional-chapters-journal.png'});
  }
  for(const code of regions){
   await page.selectOption('#questFilter','chapter:'+code);
   assert.equal(await rows.count(),8,code);
  }
  await page.setViewportSize({width:390,height:844});
  assert.ok(await page.locator('#questFilter').evaluate(el=>el.getBoundingClientRect().width<=390));
  counts.push(total);
 }
 await page.locator('#game').click();
 const x=await page.evaluate(()=>{const f=window.lab.frame;return f.actors[f.active-1].x});
 const key=x<724?'KeyD':'KeyA';
 await page.keyboard.down(key);
 try{
  await page.waitForFunction(right=>{const f=window.lab.frame,x=f.actors[f.active-1].x;return right?x>=718:x<=730},key==='KeyD');
 }finally{await page.keyboard.up(key)}
 await page.keyboard.press('KeyF');
 await page.waitForFunction(()=>window.lab.frame.story?.node==='sne-snow-match'&&window.lab.frame.storySnowball?.record?.wins>=1);
 await page.selectOption('#renderMode','h32c16');
 await page.waitForFunction(()=>window.lab.frame.draws.filter(d=>d.kind==='rect_runs').length>=5);
 await captureFrozenStage(page,'snez-snow-match-frame',{include32:true});
 await page.goto(new URL('theater-preview.html?stage=nod-moon-bloom-frame#stageComparison',base).href);
 await page.waitForFunction(()=>document.querySelector('#pixelComparison')?.textContent.includes('ピクセル'));
 assert.equal(await page.inputValue('#stage'),'nod-moon-bloom-frame');
 const split=page.locator('#stageSplit');
 for(const [key,value] of [['Home','0'],['End','100']]){
  await split.focus();await split.press(key);
  assert.equal(await split.inputValue(),value);
  assert.equal(await page.locator('#stageComparison figure').evaluate(el=>el.style.getPropertyValue('--split')),value+'%');
 }
 const figure=page.locator('#stageComparison figure');
 await figure.focus();await figure.press('ArrowRight');
 const crop=page.locator('#cropMeasurement');
 await page.waitForFunction(()=>document.querySelector('#cropMeasurement')?.textContent.includes('96 × 72'));
 const actorPixels=await crop.textContent();
 assert.ok(!actorPixels.includes('うち 0 ピクセル'));
 if(!early){
  await page.setViewportSize({width:1060,height:840});
  await page.locator('#pixelLoupe').screenshot({path:'evidence/nod-moon-bloom-loupe.png'});
  await page.setViewportSize({width:390,height:844});
 }
 await page.selectOption('#compareColors','32');
 await page.waitForFunction(()=>document.querySelector('#packetComparison')?.textContent.includes('370,815')&&document.querySelector('#cropMeasurement')?.textContent.includes('96 × 72'));
 const actorPixels32=await crop.textContent();
 assert.notEqual(actorPixels,actorPixels32);
 if(!early){
  await page.setViewportSize({width:1060,height:840});
  await page.locator('#pixelLoupe').screenshot({path:'evidence/nod-moon-bloom-loupe32.png'});
  await page.setViewportSize({width:390,height:844});
 }
 await page.selectOption('#compareColors','16');
 await page.waitForFunction(()=>document.querySelector('#packetComparison')?.textContent.includes('139,577'));
 await figure.click({position:{x:10,y:6}});
 await page.waitForFunction(()=>document.querySelector('#cropMeasurement')?.textContent.includes('うち 0 ピクセル'));
 assert.ok((await page.locator('#backgroundCompare').getAttribute('href')).includes('node=nod-bloom-grove'));
 const measures=[];
 for(const [stage,expected] of [['nod-moon-bloom-frame','139,577'],['natlan-podium-frame','%減'],['fontaine-exhibits-frame','222,037'],['snez-snow-match-frame','%減']]){
  await page.selectOption('#stage',stage);
  await page.waitForFunction(e=>document.querySelector('#packetComparison')?.textContent.includes(e)&&document.querySelector('#pixelComparison')?.textContent.includes('ピクセル'),expected);
  measures.push({stage,pixels:await page.textContent('#pixelComparison'),packet:await page.textContent('#packetComparison')});
 }
 await page.selectOption('#compareColors','32');
 await page.waitForFunction(()=>document.querySelector('#packetComparison')?.textContent.includes('342,078')&&document.querySelector('#pixelComparison')?.textContent.includes('ピクセル'));
 if(!early){
  await page.goto(base);
  await page.waitForFunction(()=>window.lab?.frame);
  await page.locator('#importSave').setInputFiles('evidence/dornman-after-chapters-save.json');
  await page.waitForFunction(()=>window.lab.frame.story?.node==='dornman-camp');
  await page.selectOption('#questFilter','branch:B06');
  assert.equal(await page.locator('#questJournal [data-status="complete"]').count(),3);
  assert.ok((await page.textContent('#chapterProgress')).includes('3 / 27件'));
  await page.selectOption('#questFilter','branch:pending');
  assert.equal(await page.locator('#questJournal [data-quest]').count(),24);
 }
 assert.deepEqual(errors,[]);
 const proof={counts,regions,measures,actorPixels,actorPixels32,viewport:390,errors};
 if(!early)await fs.writeFile('evidence/regional-chapters-browser.json',JSON.stringify(proof,null,2)+'\n');
 console.log(JSON.stringify(proof));
}finally{await browser.close()}
