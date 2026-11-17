import {chromium} from 'playwright';import fs from 'node:fs/promises';import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,channel:'chrome'}),page=await browser.newPage({viewport:{width:1440,height:1080}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8769');await page.waitForFunction(()=>window.lab?.frame);
 await page.evaluate(raw=>localStorage.setItem('maple-lua-lab.checkpoint.v1',raw),await fs.readFile('work/natlan-fixture.json','utf8'));
 await page.locator('#loadProgress').click();await page.waitForFunction(()=>window.lab.frame.story.node==='natlan-port');
 await page.waitForFunction(()=>document.querySelectorAll('#storyPanel svg circle').length===window.lab.frame.storyGraph.nodes.length);
 await page.locator('canvas').first().click();await page.keyboard.down('KeyA');await page.waitForFunction(()=>window.lab.frame.actors[0].x<135);await page.keyboard.up('KeyA');
 await page.getByRole('button',{name:'門：ナタ・岩場の道 Lv100',exact:true}).click();await page.waitForFunction(()=>window.lab.frame.story.node==='natlan-field');
 const source='hunter-seeker-idle-source-v1.png';
 await page.keyboard.down('KeyA');await page.waitForFunction(()=>window.lab.frame.camera<=320);await page.keyboard.up('KeyA');
 await page.selectOption('#renderMode','sprite');
 await page.waitForFunction(name=>window.lab.frame.draws.some(d=>d.source===name),source);
 const actual=await page.evaluate(name=>{
  const {total,draws}=window.lab.frame;
  const draw=draws.find(d=>d.source===name);
  return {total,draw};
 },source);
 assert.deepEqual([actual.total,actual.draw.h,actual.draw.y],[6,96,460]);
 assert(actual.draw.x>actual.draw.w/2&&actual.draw.x+actual.draw.w/2<960);
 await page.selectOption('#renderMode','rect');
 await page.waitForFunction(name=>!window.lab.frame.draws.some(d=>d.source===name),source);
 const popupPromise=page.waitForEvent('popup');
 await page.getByRole('link',{name:'この地点の配置比較を開く',exact:true}).click();
 const popup=await popupPromise;popup.on('pageerror',e=>errors.push(e.message));
 await popup.waitForFunction(()=>window.mapArt?.ready);
 assert.equal(await popup.locator('#node').inputValue(),'natlan-field');
 await popup.click('#loadLive');await popup.waitForFunction(()=>window.mapArt.count===6);
 for(const profile of ['legacy','h48c32','h32c16']){
  await popup.selectOption('#profile',profile);
  const state=await popup.evaluate(()=>window.mapArt);
  const spawn=state.placements.find(item=>item.id==='natlan-field-2');
  const art=state.visuals.find(item=>item.id===spawn.id);
  assert.deepEqual([spawn.species,spawn.y,art.y,art.hover,state.grounded,state.backgroundState],['hunter-seeker',480,460,20,true,'ready']);
 }
 await popup.locator('main').screenshot({path:'evidence/hunter-seeker-placement.png'});
 await popup.close();
 await page.getByRole('button',{name:'拠点へ：ナタ・谷の集落',exact:true}).click();await page.waitForFunction(()=>window.lab.frame.story.node==='natlan-hub');
 await page.waitForFunction(()=>document.getElementById('storyPanel').textContent.includes('ナタの仲間と道を確かめる'));
 await page.waitForFunction(()=>document.querySelectorAll('#storyPanel > p')[1]?.textContent.startsWith('ナタ・谷の集落'));
 await page.locator('#storyPanel').screenshot({path:'evidence/regions-browser.png'});
 const coverage=await page.evaluate(()=>({visibleNodes:window.lab.frame.storyGraph.nodes.length,visibleQuests:window.lab.frame.storyGraph.quests.length}));
 if(errors.length)throw Error(errors.join('/'));await fs.writeFile('evidence/regions-browser.json',JSON.stringify({errors,fixture:'level100 visited route',...coverage,portalWalk:true,regionalFastTravel:true,natlanQuestsShown:true,hunterSeeker:{...actual,previewProfiles:3}},null,2));console.log('Natlan portal, Hunter-Seeker and regional fast travel verified');
}finally{await browser.close()}
