import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {captureFrozenStage} from './tools/frozen-stage-capture.mjs';
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1120,height:880}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const wait=(fn,arg)=>page.waitForFunction(fn,arg,{timeout:30000});
const base=process.env.LAB_URL||'http://127.0.0.1:9118/';
const proof=[];
try{
 await page.goto(base);await wait(()=>window.lab?.frame);
 for(const [file,total] of [['work/earned-branch-expedition/shelter-three-prints.json',3],['work/earned-branch-expedition/dragonspine.json',4]]){
  await page.locator('#importSave').setInputFiles(file);
  await wait(n=>{
   const f=window.lab.frame;
   return f.story?.quests?.['spine-noon-pattern']?.status==='complete'&&
    (f.story.quests['spine-ridge-record']?.status==='complete')===(n===4);
  },total);
  await page.evaluate(()=>window.lab.action('story_fast:spine-shelter'));
  await wait(()=>window.lab.frame.story.node==='spine-shelter');
  await page.locator('#game').click();
  const right=await page.evaluate(()=>{const f=window.lab.frame;return f.actors[f.active-1].x<777});
  const key=right?'KeyD':'KeyA';
  await page.keyboard.down(key);
  try{await wait(right=>{const f=window.lab.frame,a=f.actors[f.active-1];return right?a.x>=770:a.x<=784},right)}
  finally{await page.keyboard.up(key)}
  await wait(n=>document.querySelectorAll('#frostSheet option').length===n,total);
  const paper=page.locator('#frostPrints canvas');
  const hashes=[];
  for(let i=0;i<total;i++){
   await page.selectOption('#frostSheet',String(i));
   const images=new Set(),marks=new Set();
   for(const t of ['0','4096','4608','5120','5632','6144']){
    await page.selectOption('#frostInk',t);
    await wait(([i,t])=>{const c=document.querySelector('#frostPrints canvas');return c.dataset.sheet===i&&c.dataset.tier===t},[String(i),t]);
    const [image,ink]=await paper.evaluate(async c=>{
     const ctx=c.getContext('2d'),hash=async v=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',v.data))).map(x=>x.toString(16).padStart(2,'0')).join('');
     return [await hash(ctx.getImageData(0,0,c.width,c.height)),await hash(ctx.getImageData(477,40,106,93))];
    });
    images.add(image);marks.add(ink);
   }
   assert.equal(images.size,6);assert.equal(marks.size,1);
   hashes.push([...images][0]);
  }
  assert.equal(new Set(hashes).size,total);proof.push({prints:total,tiers:6,sourceHashes:hashes});
  if(total===4){
   await page.locator('#frostPrints').screenshot({path:'evidence/spine-shelter-prints.png'});
   await captureFrozenStage(page,'spine-shelter-frame',{include32:true});
   await page.setViewportSize({width:390,height:844});
   assert.ok(await page.locator('#frostPrints').evaluate(e=>e.scrollWidth<=e.clientWidth));
   await page.getByRole('button',{name:'観測地点を地図で見る',exact:true}).click();
   await wait(()=>window.lab.frame.worldMap?.selected?.id==='spine-trace-ridge');
  }
 }
 await page.goto(base);
 await wait(()=>window.lab?.frame);
 await page.locator('#importSave').setInputFiles('evidence/branch-expedition-save.json');
 await wait(()=>window.lab.frame.story?.quests?.['novo-return-report']?.status==='complete');
 await page.selectOption('#questFilter','branch:pending');
 assert.equal(await page.locator('#questJournal [data-quest]').count(),0);
 assert.match(await page.locator('#chapterProgress').textContent(),/27 \/ 27件/);
 for(let n=1;n<=9;n++){
  await page.selectOption('#questFilter','branch:B'+String(n).padStart(2,'0'));
  const entries=page.locator('#questJournal .expeditionStops');
  assert.equal(await entries.count(),3);
  assert.ok(await entries.locator('li').count()>=6);
 }
 await page.selectOption('#questFilter','branch:B01');
 const last=page.locator('[data-quest="spine-ridge-record"] details');
 await last.locator('summary').click();
 await last.getByRole('button',{name:'地図で見る'}).first().click();
 await wait(()=>window.lab.frame.worldMap?.selected?.id==='spine-trace-ridge');
 await page.goto(new URL('theater-preview.html?stage=spine-shelter-frame#stageComparison',base).href);
 for(const colors of ['16','32']){
  await page.selectOption('#compareColors',colors);
  await wait(n=>document.querySelector('#pixelComparison').textContent.includes('ピクセル')&&document.querySelector('#packetComparison').textContent.includes(n+'色の描画命令'),colors);
 }
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/spine-shelter-browser.json',JSON.stringify({proof,branchReports:27,regions:9,errors},null,2)+'\n');
 console.log(proof.map(p=>p.prints), 'prints; 27 branch reports');
}finally{await browser.close()}
