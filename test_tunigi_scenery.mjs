import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
const base=process.env.LAB_URL||'http://127.0.0.1:8769';

try{
 await page.goto(base);
 await page.waitForFunction(()=>window.lab?.frame);
 const fixture=await fs.readFile('work/tunigi-fixture.json','utf8');
 await page.evaluate(raw=>localStorage.setItem('maple-lua-lab.checkpoint.v1',raw),fixture);
 await page.click('#loadProgress');await page.waitForFunction(()=>window.lab.frame.story?.node==='tunigi-camp');
 const survey=page.locator('[data-quest="tunigi-survey"]');
 await survey.getByRole('button',{name:'受注',exact:true}).click();
 await page.waitForFunction(()=>window.lab.frame.story.quests['tunigi-survey']);
 await page.locator('canvas').first().click();await page.keyboard.down('KeyD');
 await page.waitForFunction(()=>window.lab.frame.actors[0].x>1315);await page.keyboard.up('KeyD');
 await page.getByRole('button',{name:'門：トゥニギの黒淵・探索路 Lv60',exact:true}).click();
 await page.waitForFunction(()=>window.lab.frame.story?.node==='tunigi-depth');
 await page.locator('[data-quest="tunigi-survey"][data-status="ready"]').waitFor();

 const source='fanged-beast-idle-source-v1.png';
 await page.selectOption('#renderMode','sprite');
 await page.waitForFunction(name=>window.lab.frame.draws.some(d=>d.source===name),source);
 const {total,draw}=await page.evaluate(name=>({total:window.lab.frame.total,draw:window.lab.frame.draws.find(d=>d.source===name)}),source);
 assert.deepEqual([total,draw.y,draw.h],[6,480,112]);
 assert(draw.x-draw.w*draw.anchorX>0&&draw.x+draw.w*(1-draw.anchorX)<960);
 const decorations=await page.evaluate(async()=>{
  const {scenery,backgroundReady}=await import('./scenery.js');await backgroundReady;
  const canvas=document.createElement('canvas');canvas.width=960;canvas.height=540;
  const ctx=canvas.getContext('2d'),drawImage=ctx.drawImage.bind(ctx);
  let calls=[];
  ctx.drawImage=(image,...args)=>{
   if(image.src.endsWith('tunigi-gray-crystal-source-v1.png')){
    const {a,e,f}=ctx.getTransform();
    calls.push({x:e,base:f+args[5]+args[7],height:args[7],flip:a<0,smoothing:ctx.imageSmoothingEnabled});
   }
   drawImage(image,...args);
  };
  const frame=window.lab.frame;
  const inspect=overrides=>{calls=[];scenery(ctx,{...frame,...overrides});return calls};
  return {
   start:inspect({camera:0}),end:inspect({camera:480}),
   camp:inspect({story:{active:true,node:'tunigi-camp'},campaign:{zone:'town'}}),
   staleStory:inspect({campaign:{zone:'primo'}}),
   inactive:inspect({story:{...frame.story,active:false}}),
   inLua:frame.draws.some(d=>d.source==='tunigi-gray-crystal-source-v1.png'),
  };
 });
 assert.deepEqual(decorations.start,[
  {x:207,base:480,height:78,flip:false,smoothing:false},
  {x:742,base:480,height:94,flip:true,smoothing:false},
 ]);
 assert.deepEqual(decorations.end,[
  {x:262,base:480,height:94,flip:true,smoothing:false},
  {x:770,base:480,height:112,flip:false,smoothing:false},
 ]);
 assert.deepEqual([decorations.camp,decorations.staleStory,decorations.inactive],[[],[],[]]);
 assert.equal(decorations.inLua,false);
 await page.selectOption('#renderMode','rect');
 await page.waitForFunction(name=>!window.lab.frame.draws.some(d=>d.source===name),source);

 const open=page.waitForEvent('popup');
 await page.locator('a[href="map-art.html?node=tunigi-depth"]').click();
 const popup=await open;popup.on('pageerror',e=>errors.push(e.message));
 await popup.waitForFunction(()=>window.mapArt?.ready);
 assert.equal(await popup.locator('#node').inputValue(),'tunigi-depth');
 await popup.click('#loadLive');await popup.waitForFunction(()=>window.mapArt.count===6);
 for(const profile of ['legacy','h48c32','h32c16']){
  await popup.selectOption('#profile',profile);
  const state=await popup.evaluate(()=>window.mapArt);
  const spawn=state.placements.find(p=>p.id==='tunigi-depth-2');
  assert.deepEqual([spawn.species,spawn.x,spawn.y,state.grounded,state.background,state.backgroundState],['fanged-beast',510,480,true,'tunigi','ready']);
 }
 const comparisonLayers=await popup.evaluate(()=>{
  const count={png:0,rect:0};
  for(const id of ['png','rect']){
   const ctx=document.getElementById(id).getContext('2d'),drawImage=ctx.drawImage.bind(ctx);
   ctx.drawImage=(image,...args)=>{
    if(image.src.endsWith('tunigi-gray-crystal-source-v1.png'))count[id]++;
    drawImage(image,...args);
   };
  }
  document.getElementById('profile').dispatchEvent(new Event('input'));
  return count;
 });
 assert.deepEqual(comparisonLayers,{png:2,rect:2});
 await popup.locator('main').screenshot({path:'evidence/tunigi-crystal-placement.png'});
 await popup.locator('#camera').fill('480');
 await popup.locator('main').screenshot({path:'evidence/tunigi-crystal-placement-east.png'});
 await popup.close();
 await page.getByRole('button',{name:'拠点へ：トゥニギの黒淵・入口拠点',exact:true}).click();
 await page.waitForFunction(()=>window.lab.frame.story?.node==='tunigi-camp');
 await survey.getByRole('button',{name:'報告',exact:true}).click();
 await page.locator('[data-quest="tunigi-survey"][data-status="complete"]').waitFor();

 const mappings=await page.evaluate(async()=>{
  const {sceneryKey}=await import('./scenery.js');
  return window.lab.frame.storyGraph.nodes.filter(n=>n.region==='トゥニギの黒淵').map(n=>({id:n.id,key:sceneryKey({story:{active:true,node:n.id},storyGraph:window.lab.frame.storyGraph,campaign:{zone:n.hub?'town':'story:'+n.id}})}));
 });
 assert.deepEqual(mappings,[{id:'tunigi-camp',key:'tunigi'},{id:'tunigi-depth',key:'tunigi'}]);
 await page.close();
 const missing=await browser.newPage();missing.on('pageerror',e=>errors.push(e.message));
 await missing.route('**/assets/tunigi-gray-crystal-source-v1.png',route=>route.fulfill({status:404,body:'missing fixture'}));
 const response=missing.waitForResponse(r=>r.url().endsWith('/tunigi-gray-crystal-source-v1.png'));
 await missing.goto(base+'/map-art.html?node=tunigi-depth');
 assert.equal((await response).status(),404);
 await missing.waitForFunction(()=>window.mapArt?.ready);
 await missing.click('#loadLive');await missing.waitForFunction(()=>window.mapArt.count===6);
 const missingState=await missing.evaluate(()=>[window.mapArt.node,window.mapArt.backgroundState,window.mapArt.grounded]);
 assert.deepEqual(missingState,['tunigi-depth','ready',true]);
 await missing.close();
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/tunigi-crystal-browser.json',JSON.stringify({fixture:'Level 60 checkpoint set up at Tunigi camp',mappings,total,draw,questReported:true,placementProfiles:3,decorations,comparisonLayers,missingAssetRetainsBackgroundAndPlacement:true,errors},null,2));
 console.log('Tunigi survey, scenery prop alignment, layer isolation and missing asset fallback passed');
}finally{await browser.close()}
