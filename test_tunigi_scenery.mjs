import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));

try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8769');
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
 await popup.locator('main').screenshot({path:'evidence/fanged-beast-placement.png'});
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
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/tunigi-fanged-beast-browser.json',JSON.stringify({fixture:'Level 60 checkpoint set up at Tunigi camp',mappings,total,draw,questReported:true,placementProfiles:3,errors},null,2));
 console.log('Tunigi portal, survey report, Fanged Beast and placement comparison passed');
}finally{await browser.close()}
