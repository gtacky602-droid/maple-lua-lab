import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,channel:'chrome'}),page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
async function walkThroughPortal(node,x){
 await page.keyboard.down('KeyD');
 await page.waitForFunction(gate=>window.lab.frame.actors[0].x>gate-65,x,{timeout:30000});
 await page.keyboard.up('KeyD');
 await page.evaluate(id=>window.lab.action('story_portal:'+id),node);
 await page.waitForFunction(id=>window.lab.frame.story?.node===id,node);
}
try {
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8769/');
 await page.waitForFunction(()=>window.lab?.frame);
 await page.evaluate(()=>window.lab.action('story_start'));
 await page.waitForFunction(()=>window.lab.frame.story?.node==='mond-town');
 await walkThroughPortal('mond-road',1380);
 await page.selectOption('#renderMode','sprite');
 await page.waitForFunction(()=>['hilichurl-idle-source-v1.png','hydro-slime-idle-source-v2.png','pyro-slime-idle-source-v1.png'].every(source=>window.lab.frame.draws.some(d=>d.source===source)));
 if(await page.evaluate(()=>window.lab.frame.draws.some(d=>d.kind==='sprite'&&(d.asset===5||d.asset===7))))throw Error('Old slime atlas still drawn');
 const result=await page.evaluate(()=>({node:window.lab.frame.story.node,total:window.lab.frame.total,hilichurl:window.lab.frame.draws.find(d=>d.source==='hilichurl-idle-source-v1.png')}));
 if(result.total!==16||errors.length)throw Error(JSON.stringify({result,errors}));
 await page.locator('#game').screenshot({path:'evidence/story-enemy-browser.png'});
 await page.keyboard.press('KeyM');
 await page.locator('#worldAtlas').waitFor();
 await page.locator('#atlasLayer').selectOption('hunt');
 await page.waitForFunction(()=>{
  const map=window.lab.frame.worldMap;
  return map?.layer==='hunt'&&map.selected?.id==='mond-road'&&map.selected.huntKind==='field';
 });
 await page.keyboard.press('Escape');
 await page.locator('#worldAtlas').waitFor({state:'hidden'});
 await page.selectOption('#renderMode','rect');
 await page.waitForFunction(()=>window.lab.frame.draws.some(d=>d.kind==='rect')&&!window.lab.frame.draws.some(d=>d.source==='hilichurl-idle-source-v1.png'));
 await page.locator('#game').screenshot({path:'evidence/story-enemy-browser-rect.png'});
 await fs.writeFile('evidence/story-enemy-browser.json',JSON.stringify({result,errors,huntLayer:true,method:'walked from story start to adjacent portal using keyboard; three referenced enemy sources and PNG/rect runtime frames checked; old slime atlas absent'},null,2));
 await page.selectOption('#renderMode','sprite');
 await walkThroughPortal('mond-border',1380);
 await walkThroughPortal('dragonspine-camp',720);
 await page.locator('[data-quest="dragonspine-survey"]').getByRole('button',{name:'受注',exact:true}).click();
 await page.waitForFunction(()=>window.lab.frame.story.quests['dragonspine-survey']);
 await walkThroughPortal('dragonspine-depth',1380);
 await page.waitForFunction(()=>document.querySelector('[data-quest="dragonspine-survey"]')?.dataset.status==='ready');
 const source='frostarm-lawachurl-idle-source-v1.png';
 await page.waitForFunction(name=>window.lab.frame.draws.some(d=>d.source===name),source);
 const frostarm=await page.evaluate(name=>{
  const {total,draws}=window.lab.frame;
  const draw=draws.find(d=>d.source===name);
  return {total,draw,barrier:draws.find(d=>d.color==='#ccb6fa'&&d.x===draw.x-25)};
 },source);
 assert.deepEqual([frostarm.total,frostarm.draw.h,frostarm.draw.y],[6,128,480]);
 assert.equal(frostarm.barrier.y,frostarm.draw.y-frostarm.draw.h-15);
 const cryo=await page.evaluate(()=>window.lab.frame.draws.filter(d=>d.source==='cryo-slime-idle-source-v1.png').map(d=>[d.y,d.h]).sort((a,b)=>a[0]-b[0]));
 const ledge=await page.evaluate(()=>window.lab.frame.platforms[1].y);
 assert.deepEqual(cryo,[[ledge,40],[480,40]]);
 await page.locator('#game').screenshot({path:'evidence/frostarm-live-png.png'});
 await page.selectOption('#renderMode','rect');
 await page.waitForFunction(name=>!window.lab.frame.draws.some(d=>d.source===name),source);
 await page.locator('#game').screenshot({path:'evidence/frostarm-live-rect.png'});
 const popupPromise=page.waitForEvent('popup');
 await page.getByRole('link',{name:'この地点の配置比較を開く',exact:true}).click();
 const popup=await popupPromise;popup.on('pageerror',e=>errors.push(e.message));
 await popup.waitForFunction(()=>window.mapArt?.ready);
 assert.equal(await popup.locator('#node').inputValue(),'dragonspine-depth');
 await popup.click('#loadLive');await popup.waitForFunction(()=>window.mapArt.count===6);
 for(const profile of ['legacy','h48c32','h32c16']){
  await popup.selectOption('#profile',profile);
  const state=await popup.evaluate(()=>window.mapArt);
  assert.equal(state.placements[0].species,'frostarm-lawachurl');
  assert.deepEqual([state.visuals[0].height,state.visuals[0].y,state.grounded,state.backgroundState],[128,480,true,'ready']);
 }
 await popup.locator('main').screenshot({path:'evidence/frostarm-placement.png'});
 await popup.close();
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/frostarm-live-browser.json',JSON.stringify({frostarm,cryo,errors,portalTraversal:['mond-town','mond-road','mond-border','dragonspine-camp','dragonspine-depth'],questReady:true,placementProfiles:3},null,2));
 console.log('Browser walked to Dragonspine; live enemy, quest and placement comparisons passed');
} finally {await browser.close()}
