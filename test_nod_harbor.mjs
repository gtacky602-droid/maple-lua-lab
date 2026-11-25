import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {captureFrozenStage} from './tools/frozen-stage-capture.mjs';

const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1110,height:870}});
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
const wait=(fn,arg)=>page.waitForFunction(fn,arg,{timeout:30000});
async function walk(x){
 const start=await page.evaluate(()=>{const f=window.lab.frame;return f.actors[f.active-1].x});
 const right=start<x,key=right?'KeyD':'KeyA';
 await page.locator('#game').click();
 await page.keyboard.down(key);
 try{await wait(({right,x})=>{const f=window.lab.frame;return right?f.actors[f.active-1].x>=x-7:f.actors[f.active-1].x<=x+7},{right,x})}
 finally{await page.keyboard.up(key)}
}
async function fast(id){
 await page.evaluate(id=>window.lab.action('story_fast:'+id),id);
 await wait(id=>window.lab.frame.story.node===id,id);
}
try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:9118/');
 await wait(()=>window.lab?.frame);
 const proof=[];
 for(const [file,count] of [['work/nod-fresh-route-after-revisits/harbor-chapter.json',4],['evidence/nod-revisit-save.json',8]]){
  await page.locator('#importSave').setInputFiles(file);
  await wait(level=>window.lab.frame.progression?.level===level&&document.querySelector('#saveStatus').textContent.includes('再開'),count===4?129:140);
  await fast('nod-port');
  await walk(710);
  await page.keyboard.down('Space');
  try{await wait(()=>{const f=window.lab.frame,a=f.actors[f.active-1];return a.ground&&a.y===390&&f.storyHarborBook})}
  finally{await page.keyboard.up('Space')}
  await wait(n=>document.querySelectorAll('#harborPage option').length===n,count);
  const menu=page.locator('#harborPage'),panel=page.locator('#harborBook'),drawings=new Set();
  for(const id of await menu.locator('option').evaluateAll(options=>options.map(o=>o.value))){
   await menu.selectOption(id);
   await wait(()=>{const c=document.getElementById('harborDrawing');return c.getContext('2d').getImageData(0,0,c.width,c.height).data.some((v,i)=>i%4===3&&v)});
   drawings.add(await page.locator('#harborDrawing').evaluate(c=>c.toDataURL()));
  }
  assert.equal(drawings.size,count);
  proof.push({count,drawings:drawings.size});
  if(count===8){
   await menu.selectOption('nod-moon-rumor');
   assert.equal(await page.locator('#harborHeadline').textContent(),'小石が旅した話');
   await panel.screenshot({path:'evidence/nod-harbor-journal.png'});
   await page.setViewportSize({width:390,height:844});
   assert.ok(await panel.evaluate(e=>e.scrollWidth<=e.clientWidth));
   await page.getByRole('button',{name:'この場所を地図で見る',exact:true}).click();
   await wait(()=>window.lab.frame.worldMap?.selected?.id==='nod-rumor-quay');
   await page.keyboard.press('Escape');
   await page.setViewportSize({width:1110,height:870});
   await fast('nod-bloom-gate');
   await walk(794);
   await page.keyboard.press('KeyF');
   await wait(()=>window.lab.frame.story.node==='nod-bloom-grove'&&window.lab.frame.storyBloom?.decorated);
   await walk(1018);
   await page.selectOption('#renderMode','h32c16');
   await wait(()=>window.lab.frame.draws.some(d=>d.kind==='rect_runs'));
   await captureFrozenStage(page,'nod-moon-bloom-frame',{include32:true});
  }
 }
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/nod-harbor-browser.json',JSON.stringify({books:proof,selected:'nod-rumor-quay',mobileWidth:390,frozen:'nod-bloom-grove',errors},null,2)+'\n');
 console.log(proof);
}catch(e){
 console.error(await page.evaluate(()=>{const f=window.lab?.frame;return {node:f?.story?.node,level:f?.progression?.level,x:f?.actors[f.active-1].x,y:f?.actors[f.active-1].y,notice:f?.storyNotice,status:document.querySelector('#status')?.textContent}}));
 throw e;
}finally{await browser.close()}
