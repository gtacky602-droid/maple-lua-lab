const {chromium}=require('playwright');
const fs=require('node:fs'),assert=require('node:assert/strict');
const index=require('./content/field-sprite-index.json');
(async()=>{
 const browser=await chromium.launch({channel:'chrome'});
 try{
 const p=await browser.newPage({viewport:{width:1080,height:860}});
 await p.goto(new URL('/daily-field-guide.html',process.env.LAB_URL||'http://127.0.0.1:9118').href);
 await p.click('a[href="field-enemy-guide.html"]');
 let bytes=0;
 for(const s of index.species){
  await p.selectOption('#species',s.id);
  await p.waitForFunction(id=>document.querySelector('#source').dataset.art===id,s.id);
  const art=require('./assets/'+s.file);
  const standard=art.profiles.h48c32.runs.length,light=art.profiles.h32c16.runs.length;
  assert((await p.locator('#drawCost').innerText()).includes('32色版で'+standard+'個、16色版で'+light+'個'));
  assert(await p.evaluate(sprite=>{
   for(const profile of ['h48c32','h32c16']){
    const c=document.querySelector('#'+profile),ref=document.createElement('canvas');
    ref.width=c.width;ref.height=c.height;
    const ctx=ref.getContext('2d'),[,,w,h]=sprite.box,g=sprite.profiles[profile],k=Math.min((c.width-16)/w,(c.height-12)/h);
    const x=(c.width-w*k)/2,y=c.height-6-h*k,sx=w*k/g.width,sy=h*k/g.height;
    for(const [a,b,r,t,color] of g.runs){
     const x0=Math.round(x+a*sx),y0=Math.round(y+b*sy);
     ctx.fillStyle=color;ctx.fillRect(x0,y0,Math.round(x+(a+r)*sx)-x0,Math.round(y+(b+t)*sy)-y0);
    }
    if(c.toDataURL()!==ref.toDataURL())return false;
   }
   return true;
  },art),s.id);
  for(const [id,n] of s.places)assert(n>0 && index.places[id]);
  bytes+=Buffer.byteLength(JSON.stringify({source:art.source,box:art.box,profiles:Object.fromEntries(['h48c32','h32c16'].map(k=>[k,art.profiles[k]]))}));
 }
 for(const [art,node,legend] of [
  ['primordial-bathysmal-vishap','enkanomiya-depth','cineas-legend-chamber'],
  ['oprichniki-fireblade-shock-trooper','nod-field','nod-raskolnikov-upper-ring']
 ]){
  await p.selectOption('#species',art);
  await p.waitForFunction(id=>document.querySelector('#source').dataset.art===id,art);
  const map=await browser.newPage();
  await map.goto(await p.locator('#fieldMap').evaluate(a=>a.href));
  await map.waitForFunction(id=>window.mapArt?.ready&&document.querySelector('#liveSubject').value===id,node+'-'+art);
  await map.waitForFunction(()=>window.mapArt.backgroundState==='ready');
  await map.locator('#rect').screenshot({path:'evidence/'+art+'-ordinary-field.png'});
  await map.goto(await p.locator('#shared a').evaluate(a=>a.href));
  await map.waitForFunction(id=>window.mapArt?.ready&&window.mapArt.node===id&&document.querySelector('#sharedLegendArt')?.open,legend);
  assert((await map.locator('#sharedLegendArt figcaption').first().innerText()).includes('px'));
  await map.close();
 }
 await p.selectOption('#species','tainted-water-splitting-phantasm');
 await p.waitForFunction(()=>document.querySelector('#source').dataset.art==='tainted-water-splitting-phantasm');
 assert.match(await p.locator('#shared').innerText(),/ニニアン/);
 await p.screenshot({path:'evidence/field-enemy-guide.png',fullPage:true});
 await p.setViewportSize({width:390,height:844});
 assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 console.log(index.species.length*2,'compressed renders verified; uncompressed entries',bytes,'packed libraries',fs.statSync('assets/daily-guide-sprites.json').size+fs.statSync('assets/field-guide-extra-sprites.json').size);
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
