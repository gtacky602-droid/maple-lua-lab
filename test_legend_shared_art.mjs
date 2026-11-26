import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import fs from 'node:fs/promises';

const base=process.env.LAB_URL??'http://127.0.0.1:9117/';
const initial='witztli-tristars-camp';
const cases={
 [initial]:['fatui-skirmisher-cryogunner','fatui-skirmisher-pyroslinger'],
 'cineas-legend-chamber':['primordial-bathysmal-vishap'],
 'vivianne-legend-bank':['tainted-water-spouting-phantasm'],
 'ninianne-legend-bank':['tainted-water-splitting-phantasm'],
 'nod-raskolnikov-upper-ring':['oprichniki-fireblade-shock-trooper'],
 'sky-maha-pavilion-court':['grounded-geoshroom']
};
const browser=await chromium.launch({channel:'chrome'});
try{
 const page=await browser.newPage({viewport:{width:1200,height:900}});
 const poseRequests=[];
 page.on('request',request=>{
  const path=new URL(request.url()).pathname;
  if(path.startsWith('/assets/field-packed/'))poseRequests.push(path);
 });
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(new URL('/map-art.html?node='+initial+'&placements=live&tier=4096',base).href);
 await page.waitForFunction(()=>window.mapArt?.ready);
 const panel=page.locator('#sharedLegendArt');
 await panel.locator('summary').click();
 const ids=()=>panel.locator('a[href^="enemies-art.html"]').evaluateAll(links=>links.map(a=>new URL(a.href).searchParams.get('q')));
 const results={};
 for(const [node,expected] of Object.entries(cases)){
  await page.selectOption('#node',node);
  await page.waitForFunction(id=>window.mapArt?.ready&&window.mapArt.node===id,node);
  await panel.waitFor();
  assert.deepEqual(await ids(),expected);
  const canvases=panel.locator('canvas'),first=canvases.first();
  await page.selectOption('#profile','legacy');
  const standard=await first.evaluate(c=>c.toDataURL());
  await page.selectOption('#profile','h32c16');
  assert.notEqual(await first.evaluate(c=>c.toDataURL()),standard);
  results[node]=await panel.locator('figcaption').allTextContents();
  await panel.locator('#compareSharedProfiles').check();
  const groups=panel.locator('.shared-profile-views');
  assert.equal(await groups.count(),expected.length);
  for(const group of await groups.all()){
   const views=await group.locator('canvas').evaluateAll(cs=>cs.map(c=>{
    const ctx=c.getContext('2d');
    const painted=[0,1].map(i=>{
     const data=ctx.getImageData(i*c.width/2,0,c.width/2,c.height).data;
     return data.some((v,j)=>j%4===0&&v!==32);
    });
    return {width:c.width,height:c.height,painted,pixels:c.toDataURL()};
   }));
   assert.equal(views.length,3);
   assert.equal(new Set(views.map(v=>v.width+'x'+v.height)).size,1);
   assert.equal(new Set(views.map(v=>v.pixels)).size,3);
   assert(views.every(v=>v.painted.every(Boolean)));
  }
  if(node==='cineas-legend-chamber'){
   await groups.first().screenshot({path:'evidence/cineas-shared-profiles.png'});
   await page.setViewportSize({width:390,height:844});
   assert(await groups.first().evaluate(el=>el.getBoundingClientRect().right<=innerWidth));
   await page.setViewportSize({width:1200,height:900});
  }
  await panel.locator('#compareSharedProfiles').uncheck();
  if(node===initial){
   const [gallery]=await Promise.all([page.waitForEvent('popup'),panel.locator('a').first().click()]);
   await gallery.waitForFunction(()=>window.charactersGallery?.ready);
   assert.deepEqual(await gallery.locator('#cards article:not([hidden])').evaluateAll(cards=>cards.map(c=>c.dataset.id)),[expected[0]]);
   await gallery.close();
   await page.selectOption('#liveSubject','boss-97075');await panel.waitFor({state:'hidden'});
   await page.selectOption('#liveSubject','boss-97076');assert.deepEqual(await ids(),[expected[1]]);
   await page.selectOption('#liveSubject','');
  }
  if(node.endsWith('-legend-bank')){
   const study=panel.locator('.lake-eye-study');
   await study.locator('canvas[data-ready="true"]').nth(3).waitFor();
   assert.deepEqual(await study.locator('figcaption').allTextContents(),['元PNG','32色版','従来の16色版','目元を補正した16色版']);
   const [before,after]=await study.locator('small').allTextContents().then(labels=>labels.slice(-2));
   assert.deepEqual([before,after],node.startsWith('vivianne')?['全身 191矩形','全身 213矩形']:['全身 224矩形','全身 248矩形']);
   const colors=await study.locator('canvas').evaluateAll(cs=>cs.map(c=>Array.from(c.getContext('2d').getImageData(18,13,1,1).data)));
   for(const [r,g,b,a] of colors)assert(r>140&&g>220&&b>220&&a>220,JSON.stringify(colors));
   const error=await study.locator('canvas').evaluateAll(cs=>{
    const crops=cs.map(c=>c.getContext('2d').getImageData(9,9,19,12).data);
    return crops.slice(2).map(crop=>crop.reduce((sum,value,i)=>sum+Math.abs(value-crops[0][i]),0));
   });
   assert(error[1]<error[0],node+' eye error '+error);
   assert.equal(await study.locator('a').count(),3);
   await study.screenshot({path:'evidence/'+node+'-eye.png'});
  }
 }
 const layouts=JSON.parse(await fs.readFile('content/enemy-art-layout.json','utf8'));
 const shared=Object.values(cases).flat().map(id=>'/assets/field-packed/'+layouts[id].file);
 for(const path of shared)assert.equal(poseRequests.filter(url=>url===path).length,1,path);
 console.log(shared.length+' shared poses fetched once across six arenas');
 await page.selectOption('#node','chassanion-legend-bubble-room');
 await panel.waitFor({state:'hidden'});
 for(const species of ['fatui-frost-operative','fatui-wind-operative']){
  await page.goto(new URL('field-enemy-guide.html?species='+species,base).href);
  const candidate=page.locator('#shared nav a').filter({hasText:'待機絵の候補'});
  await candidate.click();
  await panel.locator('.shared-profile-views canvas').nth(2).waitFor();
  assert(await page.locator('#candidateIdle').isChecked());
  assert(await page.locator('#compareSharedProfiles').isChecked());
  assert.deepEqual(await ids(),[species]);
 }
 assert.deepEqual(errors,[]);
 await page.goto(new URL('/map-art.html?node=ninianne-legend-bank&placements=live#sharedLegendArt',base).href);
 await panel.locator('.eye-crops canvas').first().waitFor();
 assert(await panel.evaluate(el=>el.open));
 await fs.writeFile('evidence/legend-shared-art-browser.json',JSON.stringify(results,null,2)+'\n');
 console.log('Shared source art: seven ordinary/legend comparisons in six arenas; selection, scale, links and quality checked.');
}finally{await browser.close()}
