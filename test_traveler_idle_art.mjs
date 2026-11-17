import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1440,height:1080}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
const idle={right:'traveler-idle-source-v3.png',left:'traveler-idle-left-source-v1.png'};
const hasArt=source=>page.waitForFunction(file=>window.lab.frame.draws.some(d=>d.source===file),source);
try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8769');await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('[data-action="campaign"]').click();
 await page.waitForFunction(()=>window.lab.frame.campaign?.zone==='town');await hasArt(idle.right);
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
  await page.keyboard.up(key);await hasArt(idle[side]);
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

 const labUrl=new URL(process.env.LAB_URL||'http://127.0.0.1:8769/');
 const gallery=await browser.newPage();gallery.on('pageerror',e=>errors.push(e.message));
 await gallery.goto(new URL('characters-art.html',labUrl).href);
 await gallery.waitForFunction(()=>window.charactersGallery?.ready);
 const gallerySource=()=>gallery.evaluate(()=>window.charactersGallery.dimensions.find(d=>d.id==='traveler').source);
 assert.equal(await gallerySource(),idle.right);
 await gallery.check('#flip');assert.equal(await gallerySource(),idle.left);
 await gallery.close();

 const map=await browser.newPage();map.on('pageerror',e=>errors.push(e.message));
 await map.goto(new URL('map-art.html?node=mond-town',labUrl).href);
 await map.waitForFunction(()=>window.mapArt?.ready);
 await map.selectOption('#species','character-traveler');
 await map.locator('#png').evaluate(canvas=>{
  const r=canvas.getBoundingClientRect();
  canvas.dispatchEvent(new MouseEvent('click',{clientX:r.left+400/960*r.width,clientY:r.top+470/540*r.height}));
 });
 const placement=()=>map.evaluate(()=>({pose:window.mapArt.visuals.at(-1),item:window.mapArt.placements.at(-1),grounded:window.mapArt.grounded}));
 const right=await placement();assert.equal(right.pose.source,idle.right);
 await map.locator('#placements button').last().click();await map.locator('#flipSelected').click();
 const left=await placement();assert.equal(left.pose.source,idle.left);
 assert.deepEqual(left.item,{...right.item,flip:true});
 assert.deepEqual([left.pose.y,left.pose.height,left.grounded],[480,88,true]);
 await map.close();

 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/traveler-art-browser.json',JSON.stringify({errors,method:'Town movement using keyboard and real Lua frames; stopped again in both directions',poses,idleRestored:idle,comparison,galleryFacing:idle,mapFacing:{right,left}},null,2));

 const readArt=file=>fs.readFile(`assets/${file}.json`,'utf8').then(JSON.parse);
 const cycles=await Promise.all(['right','left'].map(side=>Promise.all([
  readArt(side==='right'?'traveler-idle-sprites-v3':'traveler-idle-left-sprites-v1'),
  ...['','-2','-3','-4'].map(phase=>readArt(`traveler-run-${side}${phase}-sprites-${phase?'v1':'v3'}`)),
 ])));
 await page.evaluate(async cycles=>{
  const preview=document.createElement('section');preview.id='runPreview';
  preview.style.cssText='width:1070px;padding:22px;background:#163a3c;color:#ecf1dc';
  const title=document.createElement('h2');title.textContent='旅人の待機と走行 — PNGと最軽量';preview.append(title);
  for(const [side,frames] of cycles.entries()){
   const heading=document.createElement('h3');heading.textContent=side?'左向き':'右向き';preview.append(heading);
   const row=document.createElement('div');row.style.cssText='display:flex;gap:10px';preview.append(row);
   for(const [phase,art] of frames.entries()){
    const image=new Image();image.src='assets/'+art.source;await image.decode();
    const card=document.createElement('div');card.style.cssText='text-align:center;background:#244748;padding:8px';
    const caption=document.createElement('div');caption.textContent=['待機','接地','通過','逆足接地','通過'][phase];
    const canvas=document.createElement('canvas');canvas.width=181;canvas.height=126;
    canvas.style.cssText='width:181px;height:126px;aspect-ratio:auto';
    const ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=false;
    const height=phase<2?88:88*art.box[3]/100,width=height*art.box[2]/art.box[3],base=108;
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
