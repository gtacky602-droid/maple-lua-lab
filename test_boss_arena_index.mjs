import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';

// test_weekly_opening_art.py exports the independent Lua rectangle streams used below.
const read=async name=>JSON.parse(await readFile(name,'utf8'));
const weekly=await read('content/weekly-boss-spawns.json'),field=await read('content/field-boss-spawns.json');
const stygian=await read('content/stygian-openings.json'),opening=(await read('evidence/weekly-opening-poses-lua.json')).shouki;
const roster=[...field.fieldBosses,...weekly.weeklyBosses,...Object.entries(stygian).map(([node,data])=>({node,name:data.name}))];
const browser=await chromium.launch({channel:'chrome',args:['--disable-accelerated-2d-canvas']});
try{
 const page=await browser.newPage({viewport:{width:1280,height:900}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(new URL('bosses-art.html?q=shouki&both=1',process.env.LAB_URL||'http://127.0.0.1:9125/').href);
 await page.waitForFunction(()=>window.charactersGallery?.ready);
 const card=page.locator('[data-id="shouki"]');
 const result=await card.evaluate(async(card,pose)=>{
  const canvas=card.querySelector('canvas'),ref=document.createElement('canvas');
  ref.width=960;ref.height=540;
  const ctx=ref.getContext('2d'),img=new Image();img.src='assets/'+pose.source;await img.decode();
  ctx.imageSmoothingEnabled=false;ctx.drawImage(img,...pose.box,pose.x-pose.w*pose.anchorX,pose.y-pose.h,pose.w,pose.h);
  ctx.fillStyle='#dae5cc';ctx.fillRect(0,pose.y,960,1);
  return [canvas.width,canvas.height,canvas.toDataURL()===ref.toDataURL()];
 },opening.png);
 assert.deepEqual(result,[960,540,true]);
 for(const key of ['h48c32','h32c16'])assert((await card.locator('.stats').innerText()).includes(opening.profiles[key].drawnRuns.toLocaleString('ja-JP')+'矩形'));
 const streams=await read('work/weekly-opening/shouki-runs.json');
 for(const [i,key] of ['h48c32','h32c16'].entries()){
  const same=await card.locator('canvas').nth(i+1).evaluate((canvas,rows)=>{
   const ref=document.createElement('canvas');ref.width=960;ref.height=540;
   const ctx=ref.getContext('2d');
   for(const [x,y,w,h,color] of rows){ctx.fillStyle=color;ctx.fillRect(x,y,w,h)}
   ctx.fillStyle='#dae5cc';ctx.fillRect(0,480,960,1);
   return ref.toDataURL()===canvas.toDataURL();
  },streams[key]);
  assert(same,key+' pixels differ from the Lua stream');
 }
 await card.locator('.pair').screenshot({path:'evidence/shouki-opening-gallery-comparison.png'});
 await page.setViewportSize({width:390,height:844});
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'mobile overflow');
 await page.setViewportSize({width:1280,height:900});
 const before=await card.locator('canvas').evaluateAll(list=>list.map(c=>c.toDataURL()));
 await page.selectOption('#shoukiForm','armored');
 const {armoredOutline}=await read('evidence/shouki-weekly-floor-contact-lua.json');
 assert.equal(new URL(page.url()).searchParams.get('pose'),'armored');
 for(const [i,url] of before.entries()){
  assert(await card.locator('canvas').nth(i).evaluate(async(c,{url,rects})=>{
   const reference=document.createElement('canvas');reference.width=c.width;reference.height=c.height;
   const ctx=reference.getContext('2d'),image=new Image();image.src=url;await image.decode();ctx.drawImage(image,0,0);
   for(const r of rects){ctx.globalAlpha=r.opacity??1;ctx.fillStyle=r.color;ctx.fillRect(r.x,r.y,r.w,r.h)}
   return c.toDataURL()===reference.toDataURL();
  },{url,rects:armoredOutline}));
 }
 await page.selectOption('#shoukiForm','candidate');
 assert.equal(await page.evaluate(()=>window.charactersGallery.dimensions.find(x=>x.id==='shouki').h),360);
 await page.selectOption('#shoukiForm','opening');
 const picker=page.locator('#bossArena'),link=page.locator('#bossArenaLink');
 assert.deepEqual(await picker.locator('option').evaluateAll(a=>a.map(o=>o.value)),roster.map(b=>b.node));
 for(const b of roster){
  await picker.selectOption(b.node);
  const url=new URL(await link.getAttribute('href'),page.url());
  assert.equal(url.searchParams.get('node'),b.node);
 }
 await link.click();
 for(const b of roster){
  await page.selectOption('#node',b.node);
  await page.waitForFunction(n=>window.mapArt?.ready&&window.mapArt.node===n&&window.mapArt.backgroundState==='ready',b.node);
  assert(await page.evaluate(()=>window.mapArt.placements.length>0),b.name);
 }
 assert.deepEqual(errors,[]);
 console.log(roster.length+' arena links and populated previews; Shouki PNG and on-screen rectangle counts match Lua.');
}finally{await browser.close()}
