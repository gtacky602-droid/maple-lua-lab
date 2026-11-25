import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {captureFrozenStage} from './tools/frozen-stage-capture.mjs';

const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1180,height:870}});
const errors=[];
const samples=JSON.parse(await fs.readFile('evidence/fontaine-theater-packing.json','utf8'));
const sampleSize=(count,profile)=>samples[count][profile].after.toLocaleString('ja-JP');
page.on('pageerror',e=>errors.push(e.message));
const wait=(fn,arg)=>page.waitForFunction(fn,arg,{timeout:30000});
async function walk(x){
 const start=await page.evaluate(()=>{const f=window.lab.frame;return f.actors[f.active-1].x});
 const right=start<x,key=right?'KeyD':'KeyA';
 await page.locator('#game').click();
 await page.keyboard.down(key);
 try{await wait(({right,x})=>{const f=window.lab.frame;return right?f.actors[f.active-1].x>=x-8:f.actors[f.active-1].x<=x+8},{right,x})}
 finally{await page.keyboard.up(key)}
}
try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:9118/');
 await wait(()=>window.lab?.frame);
 for(const [file,level,count] of [['work/fontaine-revisits-route/three-exhibits.json',92,3],['evidence/fontaine-revisit-save.json',100,5]]){
  await page.locator('#importSave').setInputFiles(file);
  await wait(level=>window.lab.frame.progression?.level===level&&document.querySelector('#saveStatus').textContent.includes('再開'),level);
  await page.evaluate(()=>window.lab.action('story_fast:fontaine-hub'));
  await wait(()=>window.lab.frame.story.node==='fontaine-hub');
  await walk(1320);
  await page.keyboard.press('KeyF');
  await wait(()=>window.lab.frame.story.node==='fontaine-grand-stage');
  await walk(350);
  await wait(n=>document.querySelectorAll('#programmeExhibits article').length===n,count);
  for(const profile of ['legacy','h48c32','h32c16']){
   await page.selectOption('#programmeProfile',profile);
   await wait(n=>Array.from(document.querySelectorAll('#programmeExhibits article')).filter(el=>el.textContent.includes('矩形')).length===n,count);
  }
  if(count===5){
   const panel=page.locator('#theaterProgramme');
   await wait(value=>document.querySelector('#programmeMeasurement').textContent.includes(value),sampleSize(5,'h32c16'));
   await panel.screenshot({path:'evidence/fontaine-theater-exhibits.png'});
   await panel.getByRole('button',{name:'掲示した写真を開く'}).click();
   await wait(()=>window.lab.frame.storyNaviaPhoto?.panel==='read');
   assert.ok(await page.locator('#groupPhoto-candid').isVisible());
   assert.ok(await page.locator('#groupPhoto-formal').isHidden());
   await page.locator('#groupPhoto-candid').screenshot({path:'evidence/fontaine-theater-posted-photo.png'});
   await page.locator('#groupPhotoClose').click();
   await wait(()=>!window.lab.frame.storyNaviaPhoto);
   await page.selectOption('#renderMode','h32c16');
   await wait(()=>window.lab.frame.draws.some(d=>d.kind==='rect_runs'));
   await captureFrozenStage(page,'fontaine-exhibits-frame');
   await page.setViewportSize({width:390,height:844});
   assert.ok(await panel.evaluate(e=>e.scrollWidth<=e.clientWidth));
   await panel.getByRole('button',{name:'客席を地図で見る'}).click();
   await wait(()=>window.lab.frame.worldMap?.selected?.id==='fon-magic-seats');
  }
 }
 await page.goto(new URL('theater-preview.html',page.url()).href);
 await wait(value=>document.querySelector('#programmeMeasurement')?.textContent.includes(value),sampleSize(5,'h32c16'));
 assert.equal(await page.locator('#programmeExhibits article').count(),5);
 await page.selectOption('#record','3');
 await wait(value=>document.querySelector('#programmeMeasurement').textContent.includes(value),sampleSize(3,'h32c16'));
 assert.equal(await page.locator('#programmeExhibits article').count(),3);
 await page.selectOption('#programmeProfile','h48c32');
 await wait(value=>document.querySelector('#programmeMeasurement').textContent.includes(value),sampleSize(3,'h48c32'));
 await wait(()=>Array.from(document.querySelectorAll('#programmeExhibits article')).every(el=>el.textContent.includes('矩形')));
 const stagePixels={};
 for(const stage of ['fontaine-exhibits-frame','natlan-podium-frame']){
  await page.selectOption('#stage',stage);
  await wait(stage=>document.querySelector('#stageSource').src.includes(stage)&&document.querySelector('#pixelComparison').textContent.includes('ピクセル'),stage);
  const slider=page.locator('#stageSplit');
  await slider.focus();
  await slider.press('Home');
  assert.equal(await slider.getAttribute('aria-valuetext'),'0パーセント');
  await slider.press('End');
  assert.equal(await slider.getAttribute('aria-valuetext'),'100パーセント');
  stagePixels[stage]=await page.locator('#pixelComparison').textContent();
 }
 assert.deepEqual(errors,[]);
 const proof={earnedLevels:[92,100],exhibits:[3,5],compared:['legacy','h48c32','h32c16'],postedPhoto:'candid',packedLiveFrame:true,mobileWidth:390,atlas:'fon-magic-seats',stagePixels,errors};
 await fs.writeFile('evidence/fontaine-theater-browser.json',JSON.stringify(proof,null,2)+'\n');
 console.log(proof);
}catch(error){
 console.error(await page.evaluate(()=>{const f=window.lab?.frame;return {node:f?.story?.node,x:f?.actors[f.active-1].x,status:document.querySelector('#status')?.textContent,programme:document.querySelector('#theaterProgramme')?.textContent?.slice(-380)}}));
 throw error;
}finally{await browser.close()}
