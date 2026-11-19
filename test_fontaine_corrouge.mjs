import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const nodes=Object.fromEntries(graph.nodes.map(n=>[n.id,n]));
const hub='fontaine-hub',host='fon-wp-55784',water='erinnyes-root-waterway',stage='erinnyes-corrouge-cleft';
const quest=graph.quests.find(q=>q.id==='fon-erinnyes-root-water-survey');
const source='fontaine-corrouge-poses-source-v1.png';
const root=process.env.LAB_URL||'http://127.0.0.1:8986/';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-gpu']});
const page=await browser.newPage({viewport:{width:1280,height:900}});
page.setDefaultTimeout(18000);
const drive=waypointDriver(page,nodes,{walkTimeout:23000});
const errors=[],requests=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('response',r=>{if(r.url().endsWith('/api/frame')&&!r.ok())errors.push('Frame HTTP '+r.status());});
page.on('request',r=>{if(new URL(r.url()).pathname.endsWith('/'+source))requests.push(r.url());});
const read=()=>page.evaluate(source=>{
 const f=window.lab?.frame;
 return f&&{t:f.t,boss:f.fieldBoss,reflect:f.storySwimCombat?.reflect,portal:f.storyNearbyPortal,
   commands:f.commands,art:f.draws.some(d=>d.source===source)};
},source);

async function locked(to,reason){
 const original=await drive.node(), edge=nodes[original].exits.find(e=>e.to===to);
 await drive.walk(edge.x);
 await drive.changeHeight(edge.y);
 await page.waitForFunction(to=>window.lab.frame.storyNearbyPortal?.to===to,to);
 const portal=(await read()).portal;
 assert.equal(portal.available,false);
 assert.match(portal.reason,reason);
 await page.keyboard.press('KeyF');
 assert.equal(await drive.node(),original);
}

async function pause(wanted){
 await page.evaluate(()=>document.activeElement.blur());
 await page.keyboard.press('KeyP');
 await page.waitForFunction(wanted=>window.lab.frame.paused===wanted,wanted);
}

try{
 await page.goto(root);
 await page.waitForFunction(()=>window.lab?.frame);
 assert.equal(requests.length,0);
 await page.locator('#importSave').setInputFiles('work/fontaine-corrouge-fixture.json');
 await drive.waitNode(hub);
 await drive.warp(host);
 await locked(water,/依頼/);
 await drive.warp(hub);
 await drive.accept(quest.id);
 await drive.warp(host);
 for(const [i,step] of quest.itinerary.entries()){
  if(step.kind==='arrive')await drive.cross(step.node);
  else{
   assert.equal(await drive.node(),step.node);
   await drive.walk(step.x);
   await drive.changeHeight(step.y);
   await page.keyboard.press('KeyG');
  }
  await drive.count(quest.id,i+1);
  if(i===1)await locked(stage,/報告/);
 }
 await drive.warp(hub);
 await drive.report(quest.id);
 await drive.warp(host);
 await page.keyboard.press('KeyM');
 const atlas=page.locator('#worldAtlas');
 await atlas.waitFor();
 await page.locator('#atlasLayer').selectOption('hunt');
 await page.waitForFunction(()=>window.lab.frame.worldMap?.layer==='hunt');
 await page.locator('#atlasField').selectOption(stage);
 await page.waitForFunction(([water,stage])=>{
  const stops=Object.values(window.lab.frame.worldMap?.guide?.stops??{}).map(p=>p.id);
  return stops[0]===water&&stops[1]===stage;
 },[water,stage]);
 await page.keyboard.press('Escape');
 await atlas.waitFor({state:'hidden'});
 await drive.cross(water);
 const oldControl=page.locator('#touchSwimGuard');
 assert.equal(await oldControl.evaluate(button=>button.hidden),true);
 await drive.cross(stage);
 await drive.walk(645);
 await page.waitForFunction(()=>{
  const f=window.lab.frame;
  return f.fieldBoss?.move==='FW54'&&f.fieldBoss.warnings[0]?.returnWindow&&
   !f.fieldBoss.warnings[0].active&&f.storySwimCombat?.reflect?.ready;
 });
 assert.equal((await oldControl.textContent()).trim(),'泡返し');
 assert.match(await page.locator('#fieldSwimHelp').textContent(),/今Kで泡返し/);

 await pause(true);
 await page.evaluate(async source=>{
  const img=new Image();
  img.src='assets/'+source;
  await img.decode();
 },source);
 assert.ok(requests.length>0);
 const png=await read();
 assert.ok(png.art&&png.boss.warnings[0].returnWindow&&!png.boss.warnings[0].active);
 const mode=page.locator('#renderMode'),canvas=page.locator('#game');
 await canvas.screenshot({path:'evidence/corrouge-planted-bubbles.png'});
 await mode.selectOption('rect');
 await page.waitForFunction(n=>window.lab.frame.commands>n+200,png.commands);
 const normal=await read();
 await mode.selectOption('h32c16');
 await page.waitForFunction(n=>window.lab.frame.commands<n,normal.commands);
 const light=await read();
 assert.equal(png.t,normal.t);
 assert.equal(png.t,light.t);
 assert.deepEqual(png.boss.warnings,light.boss.warnings);
 await canvas.screenshot({path:'evidence/corrouge-planted-bubbles-light.png'});
 await mode.selectOption('sprite');
 await pause(false);
 await page.keyboard.press('KeyK');
 await page.waitForFunction(()=>Object.values(window.lab.frame.fieldBoss?.warnings??{}).some(w=>w.returning));
 await page.waitForFunction(hp=>window.lab.frame.fieldBoss?.hp<hp,png.boss.hp);
 await drive.cross(water);
 assert.equal((await drive.actor()).y,324);
 assert.equal((await read()).reflect,undefined);
 await drive.cross(stage);
 await drive.walk(370);
 await page.waitForFunction(()=>{
  const boss=window.lab.frame.fieldBoss;
  return boss&&boss.hp===boss.maxhp;
 });
 await drive.cross(water);

 await page.goto(new URL('bosses-art.html?q=魔剣クルージュ',root).href);
 await page.waitForFunction(()=>window.charactersGallery?.ready,null,{timeout:60000});
 assert.equal(await page.locator('#cards article:not([hidden])').count(),1);
 assert.equal(await page.locator('#cards article:not([hidden]) canvas').count(),2);
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/fontaine-corrouge-browser.json',JSON.stringify({
  normalQuestSteps:quest.itinerary.length,gatesBeforeInspectionAndReport:true,nestedMapGuide:true,
  keyboardReturnsStationaryBubbleBeforeBurst:true,retreatAndRetry:true,sameFramePreview:true,gallery:true,
  commands:{png:png.commands,legacy:normal.commands,h32c16:light.commands},errors
 },null,2)+'\n');
 console.log('Chrome verified five survey steps, nested route, pre-burst K return and drawing profiles.');
}catch(error){
 console.error({frame:await read(),node:await drive.node(),actor:await drive.actor()});
 throw error;
}finally{
 await browser.close();
}
