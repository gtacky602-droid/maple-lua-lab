import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const {nodes:story}=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const nodes=Object.fromEntries(story.map(node=>[node.id,node]));
const host='fon-wp-50065', stage='ocean-judge-legend-pool';
const id='legend-fontaine_ocean_circuit_judge', source='fontaine-ocean-judge-poses-source-v1.png';
const root=process.env.LAB_URL||'http://127.0.0.1:8980/';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-gpu']});
const page=await browser.newPage({viewport:{width:1280,height:900}});
page.setDefaultTimeout(25000);
const drive=waypointDriver(page,nodes,{walkTimeout:22000});
const errors=[], requests=[];
page.on('pageerror',error=>errors.push(error.message));
page.on('response',r=>{if(r.url().endsWith('/api/frame')&&!r.ok())errors.push('Frame HTTP '+r.status());});
page.on('request',req=>{if(new URL(req.url()).pathname.endsWith('/'+source))requests.push(req.url());});

const read=()=>page.evaluate(asset=>{
 const f=window.lab.frame;
 return {t:f.t,commands:f.commands,boss:f.fieldBoss,paused:f.paused,
  art:f.draws.find(d=>d.source===asset),controls:f.storySwimCombat};
},source);
const help=page.locator('#fieldSwimHelp');

try{
 await page.goto(root);
 await page.waitForFunction(()=>window.lab?.frame);
 assert.equal(requests.length,0);
 await page.locator('#importSave').setInputFiles('work/ocean-judge-fixture.json');
 await drive.waitNode('fontaine-hub');
 await drive.warp(host);
 assert.match(await help.textContent(),/目印/);
 assert.doesNotMatch(await help.textContent(),/水撃/);

 await page.keyboard.press('KeyM');
 await page.locator('#worldAtlas').waitFor();
 await page.locator('#atlasLayer').selectOption('hunt');
 await page.locator('#atlasField').selectOption(stage);
 await page.waitForFunction(stage=>window.lab.frame.worldMap?.guide?.stops[0]?.id===stage,stage);
 await page.keyboard.press('Escape');
 await page.locator('#worldAtlas').waitFor({state:'hidden'});

 await drive.cross(stage);
 await page.waitForFunction(()=>window.lab.frame.storySwimCombat);
 assert.match(await help.textContent(),/水撃.*急回避/);
 assert.equal((await page.locator('[data-hold="attack"]').textContent()).trim(),'水撃');
 assert.equal(await page.locator('#touchSwimBurst').evaluate(b=>b.hidden),false);
 const initially=(await drive.actor()).y;
 await page.keyboard.down('KeyW');
 try{
  await page.waitForFunction(initially=>window.lab.frame.actors[0].y<initially-4,initially);
  await page.keyboard.press('Space');
  await page.waitForFunction(initially=>window.lab.frame.storySwimCombat?.burstCooldown>0&&
   window.lab.frame.actors[0].y<initially-70,initially);
 }finally{
  await page.keyboard.up('KeyW');
 }
 await drive.walk(676);
 const boss=(await read()).boss;
 assert.equal(boss.id,id);
 await drive.changeHeight(Math.min(475,boss.y+28));
 const hp=(await read()).boss.hp;
 await page.keyboard.down('KeyJ');
 try{
  await page.waitForFunction(value=>window.lab.frame.fieldBoss?.hp<value &&
   window.lab.frame.storySwimCombat?.pulseCooldown>0,hp);
 }finally{
  await page.keyboard.up('KeyJ');
 }
 await page.waitForFunction(()=>window.lab.frame.fieldBoss?.warnings?.[0]?.top);
 await page.keyboard.press('KeyP');
 await page.waitForFunction(()=>window.lab.frame.paused);
 assert.ok(requests.length>0);
 await page.evaluate(async source=>{
  const image=new Image();
  image.src='assets/'+source;
  await image.decode();
 },source);
 const png=await read();
 assert.ok(png.art&&png.boss.warnings[0]?.bottom>png.boss.warnings[0]?.top);
 const canvas=page.locator('#game');
 await canvas.screenshot({path:'evidence/ocean-judge-field.png'});
 const mode=page.locator('#renderMode');
 await mode.selectOption('rect');
 await page.waitForFunction(commands=>window.lab.frame.commands>commands+200,png.commands);
 const normal=await read();
 await mode.selectOption('h32c16');
 await page.waitForFunction(commands=>window.lab.frame.commands<commands,normal.commands);
 const light=await read();
 assert.deepEqual([png.t,normal.t],[light.t,light.t]);
 assert.deepEqual(normal.boss.warnings,light.boss.warnings);
 await canvas.screenshot({path:'evidence/ocean-judge-light.png'});

 await mode.selectOption('sprite');
 await page.evaluate(()=>document.activeElement.blur());
 await page.keyboard.press('KeyP');
 await page.waitForFunction(()=>!window.lab.frame.paused);
 await drive.cross(host);
 assert.equal((await drive.actor()).y,350);
 assert.doesNotMatch(await help.textContent(),/水撃/);
 assert.equal(await page.locator('#touchSwimBurst').evaluate(b=>b.hidden),true);
 await drive.cross(stage);
 await drive.walk(350);
 await page.waitForFunction(id=>{
  const boss=window.lab.frame.fieldBoss;
  return boss?.id===id&&boss.hp===boss.maxhp;
 },id);
 await drive.cross(host);

 const gallery=new URL('/bosses-art.html',root);
 gallery.searchParams.set('q','オーシャン巡回法官');
 await page.goto(gallery.href);
 await page.waitForFunction(()=>window.charactersGallery?.ready,null,{timeout:60000});
 assert.equal(await page.locator('#cards article:not([hidden])').count(),1);
 assert.equal(await page.locator('#cards article:not([hidden]) canvas').count(),2);
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/ocean-judge-browser.json',JSON.stringify({
  realMapGate:true,burstWithKeyboardAndWaterControls:true,
  normalPulseLanded:true,removedControlsOutsideArena:true,retreatAtSameDepthAndReentry:true,
  startupDefersBossArt:true,profileChangesKeepTimeAndWarning:true,
  commands:{png:png.commands,legacy:normal.commands,h32c16:light.commands},gallery:true,errors
 },null,2)+'\n');
 console.log('Chrome passed ocean judge entry, pulse, dodge, same-frame comparison and retreat.');
}catch(error){
 console.error(await read());
 throw error;
}finally{
 await browser.close();
}
