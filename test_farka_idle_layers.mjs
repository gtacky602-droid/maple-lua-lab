import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const fromJson=file=>fs.readFile(file,'utf8').then(JSON.parse);
const pose=await fromJson('content/farka-idle-layers.json');
const sword=await fromJson(`assets/${pose.sword.file}`);
const base=new URL(process.env.LAB_URL||'http://127.0.0.1:8769/');
const browser=await chromium.launch({headless:true,channel:'chrome'});
try{
 const page=await browser.newPage({viewport:{width:1200,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 const gallery=new URL('bosses-art.html?q=farka',base);
 await page.goto(gallery.href);
 await page.getByRole('link',{name:'ファルカの身体と二刀を比較'}).click();
 await page.waitForFunction(()=>window.farkaIdle);
 const read=()=>page.evaluate(()=>window.farkaIdle);
 const wait=async expected=>{
  await page.waitForFunction(expected=>Object.entries(expected).every(([key,value])=>window.farkaIdle?.[key]===value),expected);
  return read();
 };
 const checks=[];
 const legacyCounts={right:[0,6241,4025,1602],left:[0,5664,3571,1427]};
 let largestResponse=0;
 const api=new URL('api/farka-idle',base).href;
 for(const side of ['right','left']){
  await page.selectOption('#facing',side);
  const {body,sockets}=pose.facings[side];
  const art=await fromJson(`assets/${body}`);
  for(const mode of ['png','legacy','h48c32','h32c16']){
   await page.selectOption('#profile',mode);
   const frame=await wait({side,mode});
   assert.deepEqual([frame.side,frame.mode,frame.root],[side,mode,[128,224]]);
   for(const [hand,tip] of [['front','weapon_tip_A'],['back','weapon_tip_B']]){
    assert.deepEqual(frame.weapons[hand].hand,sockets[`hand_${hand}`]);
    assert(frame.weapons[hand].tip.every((v,i)=>Math.abs(v-sockets[tip][i])<1e-8));
   }
   const recorded=mode==='png'?0:art.profiles[mode].runs.length+2*sword.profiles[mode].runs.length;
   assert.equal(frame.rectangles,recorded);
   assert.equal(frame.rectangles,legacyCounts[side][checks.length%4]);
   assert.deepEqual(frame.draws.map(draw=>draw.file),[pose.sword.file,pose.sword.file,body]);
   assert.deepEqual(frame.draws.slice(0,2).map(draw=>draw.origin),[sockets.hand_back,sockets.hand_front]);
   const response=await page.request.post(api,{data:{side,mode}});
   assert.equal(response.status(),200);
   assert.deepEqual(await response.json(),frame);
   largestResponse=Math.max(largestResponse,(await response.body()).length);
   checks.push({side,mode,rectangles:frame.rectangles});
  }
 }
 const unchanged=await read();
 const canvas=page.locator('#layered');
 const direct=await canvas.evaluate(c=>c.toDataURL());
 await page.locator('#nativePixels').check();
 const native=await canvas.evaluate(c=>c.toDataURL());
 assert.notEqual(native,direct);
 assert.deepEqual(await read(),unchanged);
 assert.match(await page.locator('#cost').textContent(),/3,571矩形 ／ 16色 1,427矩形/);
 await page.locator('#nativePixels').uncheck();
 assert.equal(await canvas.evaluate(c=>c.toDataURL()),direct);
 const loaded=await page.evaluate(()=>performance.getEntriesByType('resource').map(e=>new URL(e.name).pathname));
 for(const file of [pose.sword.file,pose.facings.left.body,pose.facings.right.body]){
  assert.equal(loaded.filter(path=>path==='/assets/stygian-packed/'+file).length,1,file);
  assert.ok(!loaded.includes('/assets/'+file),file);
 }
 for(const facing of Object.values(pose.guide.facings))assert.ok(!loaded.includes('/assets/'+facing.body));
 const before=await read();
 await page.locator('#frontAngle').fill('20');
 await page.locator('#markers').check();
 const after=await wait({frontAngle:20});
 assert.deepEqual(after.weapons.front.hand,before.weapons.front.hand);
 assert.deepEqual(after.weapons.back,before.weapons.back);
 assert.notDeepEqual(after.weapons.front.tip,before.weapons.front.tip);
 const radius=weapon=>Math.hypot(...weapon.tip.map((p,i)=>p-weapon.hand[i]));
 assert(Math.abs(radius(after.weapons.front)-radius(before.weapons.front))<1e-8);

 await page.locator('#front').uncheck();
 await page.locator('#body').uncheck();
 const hidden=await wait({body:false});
 assert.deepEqual(Object.keys(hidden.weapons),['back']);
 assert.equal(hidden.rectangles,sword.profiles.h32c16.runs.length);
 await page.locator('#frontAngle').evaluate(slider=>{
  for(let angle=-17;angle<=19;angle+=2){
   slider.value=angle;
   slider.dispatchEvent(new Event('input',{bubbles:true}));
  }
 });
 await wait({frontAngle:19});
 await page.getByRole('button',{name:'初期状態に戻す'}).click();
 const reset=await wait({side:'right',mode:'png',body:true,frontAngle:0,backAngle:0});
 assert.equal(reset.draws.length,3);
 await page.locator('.scenes').screenshot({path:'evidence/farka-idle-layer-comparison.png'});
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 for(const data of [{mode:'test'},{side:'up'},{front:0},{backAngle:26},[]]){
  assert.equal((await page.request.post(api,{data})).status(),400);
 }
 const empty=await page.request.post(api,{data:{body:false,front:false,back:false,mode:'legacy'}});
 assert.equal(empty.status(),200);
 const blank=await empty.json();
 assert.deepEqual([blank.draws,blank.weapons,blank.rectangles],[[],{},0]);
 const emptyGuide=await page.request.post(api,{data:{variant:'guide',body:false,front:false,back:false}});
 assert.equal(emptyGuide.status(),200);
 const emptyFrame=await emptyGuide.json();
 assert.deepEqual([emptyFrame.draws,emptyFrame.baseline.draws],[[],[]]);
 assert.equal((await page.request.post(api,{data:{variant:'future'}})).status(),400);

 await page.goto(gallery.href);
 await page.getByRole('link',{name:'ファルカの低頭身候補を比較'}).click();
 await wait({variant:'guide',side:'right',mode:'png'});
 const guideChecks=[];
 for(const side of ['right','left']){
  await page.selectOption('#facing',side);
  const guide=pose.guide.facings[side];
  const art=await fromJson(`assets/${guide.body}`);
  for(const mode of ['png','legacy','h48c32','h32c16']){
   await page.selectOption('#profile',mode);
   const frame=await wait({variant:'guide',side,mode});
   assert.deepEqual(frame.root,[128,224]);
   assert.deepEqual([frame.baseline.height,frame.height],[152,136]);
   assert.deepEqual(frame.draws.slice(0,2).map(draw=>draw.origin),[guide.sockets.hand_back,guide.sockets.hand_front]);
   for(const [layer,file,height] of [[frame,guide.body,136],[frame.baseline,pose.facings[side].body,152]]){
    const body=layer.draws.at(-1);
    assert.equal(body.file,file);
    assert.equal(body.height,height);
    assert.equal(body.top+body.height,frame.root[1]);
   }
   const recorded=mode==='png'?0:art.profiles[mode].runs.length+2*sword.profiles[mode].runs.length;
   assert.equal(frame.rectangles,recorded);
   assert.equal(frame.baseline.rectangles,legacyCounts[side][guideChecks.length%4]);
   guideChecks.push({side,mode,current:frame.baseline.rectangles,guide:frame.rectangles});
  }
 }
 await page.locator('#backAngle').fill('-15');
 const turned=await wait({backAngle:-15,variant:'guide'});
 assert.deepEqual(turned.weapons.back.hand,pose.guide.facings.left.sockets.hand_back);
 assert.deepEqual(turned.baseline.weapons.back.hand,pose.facings.left.sockets.hand_back);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.setViewportSize({width:1200,height:1000});
 await page.locator('#backAngle').fill('0');
 await page.selectOption('#facing','right');
 const backgrounds=await page.locator('.scenes canvas').evaluateAll(async canvases=>{
  const styles=canvases.map(canvas=>getComputedStyle(canvas).backgroundImage);
  const image=new Image();
  image.src=styles[0].slice(5,-2);
  await image.decode();
  return styles;
 });
 assert.equal(backgrounds[0],backgrounds[1]);
 assert.match(backgrounds[0],/mondstadt-background.png/);
 for(const [mode,suffix] of [['png','png'],['h32c16','light']]){
  await page.selectOption('#profile',mode);
  await wait({side:'right',mode,backAngle:0,variant:'guide'});
  await page.locator('.scenes').screenshot({path:`evidence/farka-guide-idle-${suffix}.png`});
 }
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/farka-idle-layer-test.json',JSON.stringify({renderer:'Lua',checks,largestResponse,guideChecks,guideSharedBackground:true,independentRotation:true,independentVisibility:true,rapidInputs:true,invalidInputsRejected:true,mobileOverflow:false,errors},null,2));
 console.log('Farka layered idle: both facings and 4 render modes passed for both sizes, including shared background and floor anchor');
}finally{await browser.close()}
