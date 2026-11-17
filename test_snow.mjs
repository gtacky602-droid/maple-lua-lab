import {chromium} from 'playwright';import fs from 'node:fs/promises';import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,channel:'chrome'}),page=await browser.newPage({viewport:{width:1440,height:1080}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8769');await page.waitForFunction(()=>window.lab?.frame);
 await page.evaluate(raw=>localStorage.setItem('maple-lua-lab.checkpoint.v1',raw),await fs.readFile('work/snow-fixture.json','utf8'));
 await page.locator('#loadProgress').click();await page.waitForFunction(()=>window.lab.frame.story.node==='snezhnaya-hub');
 await page.waitForFunction(()=>document.querySelectorAll('#storyPanel svg circle').length===window.lab.frame.storyGraph.nodes.length);
 await page.locator('canvas').first().click();await page.keyboard.down('KeyD');await page.waitForFunction(()=>window.lab.frame.actors[0].x>1305);await page.keyboard.up('KeyD');
 await page.getByRole('button',{name:'門：スネージナヤ・凍った街道 Lv140',exact:true}).click();await page.waitForFunction(()=>window.lab.frame.story.node==='snezhnaya-field');
 const source='cryo-slime-idle-source-v1.png';
 await page.selectOption('#renderMode','sprite');
 await page.waitForFunction(name=>window.lab.frame.draws.filter(d=>d.source===name).length===2,source);
 const cryo=await page.evaluate(name=>{
  const {draws,total,platforms}=window.lab.frame;
  return {total,ledge:platforms[1].y,draws:draws.filter(d=>d.source===name).map(d=>[d.y,d.h]).sort((a,b)=>a[0]-b[0])};
 },source);
 assert.equal(cryo.total,6);
 assert.deepEqual(cryo.draws,[[cryo.ledge,40],[480,40]]);
 await page.selectOption('#renderMode','rect');
 await page.waitForFunction(name=>!window.lab.frame.draws.some(d=>d.source===name),source);
 const popupPromise=page.waitForEvent('popup');
 await page.getByRole('link',{name:'この地点の配置比較を開く',exact:true})
  .and(page.locator('a[href="map-art.html?node=snezhnaya-field"]')).click();
 const popup=await popupPromise;popup.on('pageerror',e=>errors.push(e.message));
 await popup.waitForFunction(()=>window.mapArt?.ready);
 assert.equal(await popup.locator('#node').inputValue(),'snezhnaya-field');
 await popup.click('#loadLive');await popup.waitForFunction(()=>window.mapArt.count===6);
 for(const profile of ['legacy','h48c32','h32c16']){
  await popup.selectOption('#profile',profile);
  const state=await popup.evaluate(()=>window.mapArt);
  const ice=state.placements.filter(p=>p.species==='cryo-slime');
  assert.equal(ice.length,3);
  assert(state.grounded&&state.backgroundState==='ready');
 }
 await popup.locator('main').screenshot({path:'evidence/cryo-slime-snow-placement.png'});
 await popup.close();
 await page.getByRole('button',{name:'拠点へ：スネージナヤ・雪の町',exact:true}).click();await page.waitForFunction(()=>window.lab.frame.story.node==='snezhnaya-hub');
 await page.waitForFunction(()=>document.getElementById('storyPanel').textContent.includes('ミティアと雪道を見回る'));
 await page.waitForFunction(()=>document.querySelectorAll('#storyPanel > p')[1]?.textContent.startsWith('スネージナヤ・雪の町'));
 await page.locator('#storyPanel').screenshot({path:'evidence/snow-browser.png'});
 const coverage=await page.evaluate(()=>({visibleNodes:window.lab.frame.storyGraph.nodes.length,visibleQuests:window.lab.frame.storyGraph.quests.length}));
 if(errors.length)throw Error(errors.join('/'));await fs.writeFile('evidence/snow-browser.json',JSON.stringify({errors,fixture:'level140 joined Mitya',...coverage,portalWalk:true,regionalFastTravel:true,snowQuestsShown:true,cryo:{...cryo,previewProfiles:3}},null,2));console.log('Snezhnaya portal, Cryo Slime and regional fast travel verified');
}finally{await browser.close()}
