import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1440,height:1080}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
const idle='traveler-idle-source-v3.png';
const hasArt=source=>page.waitForFunction(file=>window.lab.frame.draws.some(d=>d.source===file),source);
try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8769');await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('[data-action="campaign"]').click();
 await page.waitForFunction(()=>window.lab.frame.campaign?.zone==='town');await hasArt(idle);
 await page.locator('#game').screenshot({path:'evidence/traveler-art-browser.png'});
 const poses=[];
 for(const [side,key,travel] of [['right','KeyD',160],['left','KeyA',60]]){
  const source=`traveler-run-${side}-source-v3.png`;
  const start=await page.evaluate(()=>window.lab.frame.actors[0].x);
  await page.keyboard.down(key);await hasArt(source);
  await page.waitForFunction(({start,travel})=>Math.abs(window.lab.frame.actors[0].x-start)>travel,{start,travel});
  const fit=await page.evaluate(file=>{
   const frame=window.lab.frame,actor=frame.actors[0],draw=frame.draws.find(d=>d.source===file);
   return {draw,actor:{x:actor.x-frame.camera,y:actor.y,walk:actor.walk}};
  },source);
  await page.keyboard.up(key);await hasArt(idle);
  assert(fit.actor.walk!==0);
  assert.deepEqual([fit.draw.x,fit.draw.y,fit.draw.h,fit.draw.flip],[fit.actor.x,fit.actor.y,88,false]);
  poses.push({side,...fit});
 }
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/traveler-art-browser.json',JSON.stringify({errors,method:'Town movement using keyboard and real Lua frames; stopped again in both directions',poses,idleRestored:true},null,2));

 const frames=[
  ['待機',JSON.parse(await fs.readFile('assets/traveler-idle-sprites-v3.json','utf8'))],
  ['右向き',JSON.parse(await fs.readFile('assets/traveler-run-right-sprites-v3.json','utf8'))],
  ['左向き',JSON.parse(await fs.readFile('assets/traveler-run-left-sprites-v3.json','utf8'))],
 ];
 await page.evaluate(async frames=>{
  const preview=document.createElement('section');preview.id='runPreview';
  preview.style.cssText='width:820px;padding:20px;background:#163a3c;color:#ecf1dc';
  const title=document.createElement('h2');title.textContent='旅人の待機と走行';preview.append(title);
  const row=document.createElement('div');row.style.cssText='display:flex;gap:12px';preview.append(row);
  for(const [name,art] of frames){
   const image=new Image();image.src='assets/'+art.source;await image.decode();
   const card=document.createElement('div');card.style.cssText='text-align:center;background:#244748;padding:8px';
   const caption=document.createElement('p');caption.textContent=name;
   const canvas=document.createElement('canvas');canvas.width=236;canvas.height=214;
   canvas.style.cssText='width:236px;height:214px;aspect-ratio:auto';
   const ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=false;
   const height=176,width=height*art.box[2]/art.box[3],base=197;
   ctx.fillStyle='#a5bcad';ctx.fillRect(7,base,222,1);
   ctx.drawImage(image,...art.box,118-width*art.anchorX,base-height,width,height);
   card.append(caption,canvas);row.append(card);
  }
  document.body.prepend(preview);
 },frames);
 await page.locator('#runPreview').screenshot({path:'evidence/traveler-run-comparison.png'});
 console.log('Traveler browser stops, runs and returns to idle in both directions');
}finally{await browser.close()}
