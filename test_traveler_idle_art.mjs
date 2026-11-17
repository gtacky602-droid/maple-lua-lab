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
 for(const [side,key] of [['right','KeyD'],['left','KeyA']]){
  await page.evaluate(()=>window.travelerRunFrames=new Map());
  await page.keyboard.down(key);
  const samples=await page.waitForFunction(direction=>{
   const frame=window.lab.frame,actor=frame.actors[0];
   const draw=frame.draws.find(d=>d.source?.startsWith(`traveler-run-${direction}-`));
   if(draw)window.travelerRunFrames.set(draw.source,{draw,actor:{x:actor.x-frame.camera,y:actor.y,walk:actor.walk}});
   return window.travelerRunFrames.size===4?[...window.travelerRunFrames.values()]:false;
  },side);
  await page.keyboard.up(key);await hasArt(idle);
  for(const fit of await samples.jsonValue()){
   assert.equal(fit.actor.walk,side==='right'?1:-1);
   assert.deepEqual([fit.draw.x,fit.draw.y,fit.draw.flip],[fit.actor.x,fit.actor.y,false]);
   assert(fit.draw.h>=86&&fit.draw.h<=88);
   poses.push({side,...fit});
  }
 }
 const compare=await browser.newPage();
 compare.on('pageerror',e=>errors.push(e.message));
 await compare.goto(new URL('compare.html',process.env.LAB_URL||'http://127.0.0.1:8769/').href);
 await compare.waitForFunction(()=>window.compareLab?.frame);
 await compare.locator('#left').selectOption('png');await compare.locator('#right').selectOption('h32c16');
 await compare.locator('#freeze').click();await compare.keyboard.down('KeyD');
 const pair=await compare.waitForFunction(()=>{
  const lab=window.compareLab,[a,b]=lab.frame.comparisons;
  const sprite=a.draws.find(d=>d.source?.startsWith('traveler-run-right-'));
  if(lab.profiles.join('/')!=='png/h32c16'||!sprite)return false;
  return {sprite,sameFrame:lab.frame.t,a:a.commands,b:b.commands,rectangles:b.draws.filter(d=>d.kind==='rect').length};
 });
 await compare.keyboard.up('KeyD');
 const comparison=await pair.jsonValue();assert(comparison.rectangles>0);
 await compare.close();
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/traveler-art-browser.json',JSON.stringify({errors,method:'Town movement using keyboard and real Lua frames; stopped again in both directions',poses,idleRestored:true,comparison},null,2));

 const cycles=await Promise.all(['right','left'].map(side=>Promise.all(['','-2','-3','-4'].map(phase=>fs.readFile(`assets/traveler-run-${side}${phase}-sprites-${phase?'v1':'v3'}.json`,'utf8').then(JSON.parse)))));
 await page.evaluate(async cycles=>{
  const preview=document.createElement('section');preview.id='runPreview';
  preview.style.cssText='width:864px;padding:22px;background:#163a3c;color:#ecf1dc';
  const title=document.createElement('h2');title.textContent='旅人の走行 — PNGと最軽量';preview.append(title);
  for(const [side,frames] of cycles.entries()){
   const heading=document.createElement('h3');heading.textContent=side?'左向き':'右向き';preview.append(heading);
   const row=document.createElement('div');row.style.cssText='display:flex;gap:10px';preview.append(row);
   for(const [phase,art] of frames.entries()){
    const image=new Image();image.src='assets/'+art.source;await image.decode();
    const card=document.createElement('div');card.style.cssText='text-align:center;background:#244748;padding:8px';
    const caption=document.createElement('div');caption.textContent=['接地','通過','逆足接地','通過'][phase];
    const canvas=document.createElement('canvas');canvas.width=181;canvas.height=126;
    canvas.style.cssText='width:181px;height:126px;aspect-ratio:auto';
    const ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=false;
    const height=phase===0?88:88*art.box[3]/100,width=height*art.box[2]/art.box[3],base=108;
    ctx.fillStyle='#a5bcad';ctx.fillRect(6,base,169,1);
    ctx.drawImage(image,...art.box,43-width*art.anchorX,base-height,width,height);
    const profile=art.profiles.h32c16,sx=width/profile.width,sy=height/profile.height;
    for(const [x,y,w,h,color] of profile.runs){
     ctx.fillStyle=color;ctx.fillRect(133-width*art.anchorX+x*sx,base-height+y*sy,w*sx+.05,h*sy+.05);
    }
    ctx.fillStyle='#ecf1dc';ctx.font='11px sans-serif';ctx.textAlign='center';
    ctx.fillText('PNG',43,122);ctx.fillText('44px・16色',133,122);
    card.append(caption,canvas);row.append(card);
   }
  }
  document.body.prepend(preview);
 },cycles);
 await page.locator('#runPreview').screenshot({path:'evidence/traveler-run-comparison.png'});
 console.log('Traveler browser stops, runs and returns to idle in both directions');
}finally{await browser.close()}
