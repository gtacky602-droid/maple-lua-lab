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
 const checks=[];
 for(const side of ['right','left']){
  await page.selectOption('#facing',side);
  const {body,sockets}=pose.facings[side];
  const art=await fromJson(`assets/${body}`);
  for(const mode of ['png','legacy','h48c32','h32c16']){
   await page.selectOption('#profile',mode);
   const frame=await read();
   assert.deepEqual([frame.side,frame.mode,frame.root],[side,mode,[128,224]]);
   for(const [hand,tip] of [['front','weapon_tip_A'],['back','weapon_tip_B']]){
    assert.deepEqual(frame.weapons[hand].hand,sockets[`hand_${hand}`]);
    assert(frame.weapons[hand].tip.every((v,i)=>Math.abs(v-sockets[tip][i])<1e-8));
   }
   const recorded=mode==='png'?0:art.profiles[mode].runs.length+2*sword.profiles[mode].runs.length;
   assert.equal(frame.rectangles,recorded);
   checks.push({side,mode,rectangles:frame.rectangles});
  }
 }
 const before=await read();
 await page.locator('#frontAngle').fill('20');
 await page.locator('#markers').check();
 const after=await read();
 assert.deepEqual(after.weapons.front.hand,before.weapons.front.hand);
 assert.deepEqual(after.weapons.back,before.weapons.back);
 assert.notDeepEqual(after.weapons.front.tip,before.weapons.front.tip);
 const radius=weapon=>Math.hypot(...weapon.tip.map((p,i)=>p-weapon.hand[i]));
 assert(Math.abs(radius(after.weapons.front)-radius(before.weapons.front))<1e-8);

 await page.locator('#front').uncheck();
 await page.locator('#body').uncheck();
 assert.deepEqual(Object.keys((await read()).weapons),['back']);
 assert.equal((await read()).rectangles,sword.profiles.h32c16.runs.length);
 assert.equal((await read()).body,false);
 await page.getByRole('button',{name:'初期状態に戻す'}).click();
 await page.waitForFunction(()=>window.farkaIdle.side==='right'&&window.farkaIdle.mode==='png'&&window.farkaIdle.body&&Object.keys(window.farkaIdle.weapons).length===2);
 await page.locator('.scenes').screenshot({path:'evidence/farka-idle-layer-comparison.png'});
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/farka-idle-layer-test.json',JSON.stringify({checks,independentRotation:true,independentVisibility:true,mobileOverflow:false,errors},null,2));
 console.log('Farka layered idle: both facings, 4 render modes, fixed grip, independent rotation, visibility and reset passed');
}finally{await browser.close()}
