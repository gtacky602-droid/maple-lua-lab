import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1440,height:1080}}),errors=[];
const base=new URL(process.env.LAB_URL||'http://127.0.0.1:8769/');
const source=side=>`beidou-idle-${side}-source-v4.png`;
page.on('pageerror',e=>errors.push(e.message));

try{
 await page.goto(base.href);await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('[data-action="campaign"]').click();
 await page.waitForFunction(()=>window.lab.frame.campaign?.zone==='town');
 await page.locator('[data-action="companion:beidou"]').click();
 await page.evaluate(()=>window.lab.action('swap'));
 await page.waitForFunction(()=>window.lab.frame.active===2);
 const poses=[];
 for(const [side,key] of [['right','KeyD'],['left','KeyA']]){
  await page.keyboard.down(key);
  const moving=await page.waitForFunction(file=>{
   const f=window.lab.frame,actor=f.actors[1],draw=f.draws.find(d=>d.source===file);
   return actor.walk!==0&&draw;
  },source(side));
  await page.keyboard.up(key);
  const waiting=await page.waitForFunction(file=>{
   const f=window.lab.frame,actor=f.actors[1],draw=f.draws.find(d=>d.source===file);
   return actor.walk===0&&draw&&{draw,x:actor.x-f.camera,y:actor.y};
  },source(side));
  const {draw,x,y}=await waiting.jsonValue();
  assert.deepEqual([draw.x,draw.y,draw.h,draw.flip],[x,y,88,false]);
  poses.push({side,moving:await moving.jsonValue(),waiting:draw});
 }
 await page.locator('#game').screenshot({path:'evidence/beidou-art-browser.png'});

 await page.goto(new URL('characters-art.html?q=beidou',base).href);
 await page.waitForFunction(()=>window.charactersGallery?.ready);
 const gallerySource=()=>page.evaluate(()=>window.charactersGallery.dimensions.find(d=>d.id==='beidou').source);
 assert.equal(await gallerySource(),source('right'));
 await page.check('#flip');assert.equal(await gallerySource(),source('left'));
 assert.equal(await page.evaluate(()=>window.charactersGallery.visibleCount),1);
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/beidou-art-browser.json',JSON.stringify({errors,poses,galleryBothFacings:true},null,2));

 const columns=[['旅人','traveler-idle-sprites-v3'],['北斗・旧版','beidou-idle-sprites'],['北斗・右向き','beidou-idle-right-sprites-v4'],['北斗・左向き','beidou-idle-left-sprites-v4']];
 const art=await Promise.all(columns.map(async ([name,file])=>[name,JSON.parse(await fs.readFile(`assets/${file}.json`,'utf8'))]));
 await page.evaluate(async art=>{
  const preview=document.createElement('section');preview.id='poseComparison';
  preview.style.cssText='width:920px;padding:20px;background:#18363f;color:#f4f4de';
  const heading=document.createElement('h2');heading.textContent='北斗の待機絵 — 元PNGと44px・16色';preview.append(heading);
  const row=document.createElement('div');row.style.cssText='display:flex;gap:10px';preview.append(row);
  for(const [name,data] of art){
   const card=document.createElement('div');card.style.cssText='background:#234c52;text-align:center;padding:8px';
   const caption=document.createElement('h3');caption.textContent=name;
   const canvas=document.createElement('canvas');canvas.width=196;canvas.height=204;canvas.style.cssText='width:196px;height:204px;background:#234c52;';
   const ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=false;
   const h=158,w=h*data.box[2]/data.box[3],base=178,anchor=data.anchorX??.5;
   ctx.fillStyle='#b8ccbf';ctx.fillRect(0,base,196,1);
   const image=new Image();image.src='/assets/'+data.source;await image.decode();
   ctx.drawImage(image,...data.box,49-w*anchor,base-h,w,h);
   const profile=data.profiles.h32c16,sx=w/profile.width,sy=h/profile.height;
   for(const [x,y,rw,rh,color] of profile.runs){ctx.fillStyle=color;ctx.fillRect(147-w*anchor+x*sx,base-h+y*sy,rw*sx+.05,rh*sy+.05)}
   ctx.fillStyle='#f4f4de';ctx.font='12px sans-serif';ctx.textAlign='center';
   ctx.fillText('PNG',49,196);ctx.fillText('44px・16色',147,196);
   card.append(caption,canvas);row.append(card);
  }
  document.body.prepend(preview);
 },art);
 await page.locator('#poseComparison').screenshot({path:'evidence/beidou-idle-proportions.png'});
 console.log('Beidou left/right staged PNG, actor anchor, stop and gallery passed');
}finally{await browser.close()}
