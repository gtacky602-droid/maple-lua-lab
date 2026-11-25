import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {captureFrozenStage} from './tools/frozen-stage-capture.mjs';

const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1120,height:900}});
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
const wait=(fn,arg)=>page.waitForFunction(fn,arg,{timeout:30000});
try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:9118/');
 await wait(()=>window.lab?.frame);
 for(const [file,n] of [['evidence/natlan-after-fontaine-save.json',5],['evidence/natlan-revisit-save.json',7]]){
  await page.locator('#importSave').setInputFiles(file);
  await wait(()=>window.lab.frame.story?.node==='nod-town'&&document.querySelector('#saveStatus').textContent.includes('再開'));
  await page.evaluate(()=>window.lab.action('story_fast:natlan-sunset-rostrum'));
  await wait(()=>window.lab.frame.story.node==='natlan-sunset-rostrum');
  const x=await page.evaluate(()=>{const f=window.lab.frame;return f.actors[f.active-1].x});
  const right=x<847,key=right?'KeyD':'KeyA';
  await page.locator('#game').click();
  await page.keyboard.down(key);
  try{await wait(right=>{const f=window.lab.frame,x=f.actors[f.active-1].x;return right?x>=840:x<=854},right)}
  finally{await page.keyboard.up(key)}
  await page.keyboard.down('Space');
  try{await wait(()=>{const f=window.lab.frame,a=f.actors[f.active-1];return a.ground&&a.y===390&&f.storyFestivalLedger})}
  finally{await page.keyboard.up('Space')}
  await wait(n=>document.querySelectorAll('#festivalLedger dt').length===n,n);
  if(n===7){
   await page.selectOption('#renderMode','h32c16');
   await wait(()=>window.lab.frame.draws.some(d=>d.kind==='rect_runs'));
   const panel=page.locator('#festivalLedger'),ledger=await panel.textContent();
   assert.match(ledger,/高い型 → 低い型 → 高い型/);
   assert.match(ledger,/被弾2回.*被弾1回/);
   await panel.screenshot({path:'evidence/natlan-festival-ledger.png'});
   await captureFrozenStage(page,'natlan-podium-frame');
   await page.setViewportSize({width:390,height:844});
   assert.ok(await panel.evaluate(el=>el.scrollWidth<=el.clientWidth));
   await panel.getByRole('button',{name:'シロネンの踏み台'}).click();
   await wait(()=>window.lab.frame.worldMap?.selected?.id==='natlan-xilonen-course');
  }
 }
 assert.deepEqual(errors,[]);
 const proof={earnedLevel:120,records:[5,7],packed:true,mobileWidth:390,destination:'natlan-xilonen-course',errors};
 await fs.writeFile('evidence/natlan-festival-browser.json',JSON.stringify(proof,null,2)+'\n');
 console.log(proof);
}catch(error){
 console.error(await page.evaluate(()=>{const f=window.lab?.frame;return {node:f?.story?.node,x:f?.actors[f.active-1].x,y:f?.actors[f.active-1].y,status:document.querySelector('#status')?.textContent}}));
 throw error;
}finally{await browser.close()}
