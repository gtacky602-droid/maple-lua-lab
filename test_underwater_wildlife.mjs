import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const read=async file=>JSON.parse(await fs.readFile(file,'utf8'));
const layouts=await read('content/enemy-art-layout.json');
const routes={};
for(const [art,layout] of Object.entries(layouts)){
 for(const [node,site] of Object.entries(layout.habitats??{}))(routes[node]??=[]).push({art,...site});
}
const nodes=Object.fromEntries((await read('content/story-graph.json')).nodes.map(n=>[n.id,n]));
const base=process.env.LAB_URL??'http://127.0.0.1:9118/';
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1280,height:900}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(new URL('/enemies-art.html?q=hunters-ray',base).href);
 await page.getByRole('link',{name:'水中での大きさと配置を見る'}).first().click();
 for(const [node,animals] of Object.entries(routes)){
  await page.selectOption('#node',node);
  await page.waitForFunction(id=>window.mapArt?.ready&&window.mapArt.node===id&&window.mapArt.backgroundState==='ready',node);
  assert.equal(new URL(await page.locator('#wildlifeNote a').evaluate(a=>a.href)).searchParams.get('q'),animals[0].art);
  if(node==='fon-wp-50075')await page.locator('#rect').screenshot({path:'evidence/fontaine-ray-placement.png'});
 }
 await page.addInitScript(()=>{
  window.paintedSpriteSheets=new Set();
  const draw=CanvasRenderingContext2D.prototype.drawImage;
  CanvasRenderingContext2D.prototype.drawImage=function(image,...args){
   const result=draw.call(this,image,...args);
   if(this.canvas.id==='game'&&image instanceof HTMLImageElement&&args.length===8){
    window.paintedSpriteSheets.add(new URL(image.src).pathname+'#'+args.slice(0,4).join(','));
   }
   return result;
  };
 });
 await page.goto(new URL('/index.html',base).href);
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#importSave').setInputFiles('evidence/fontaine-wildlife-save.json');
 const drive=waypointDriver(page,nodes,{walkTimeout:23000});
 await drive.waitNode('fontaine-hub');
 for(const [node,animals] of Object.entries(routes)){
  if(!nodes[node].waypoint)continue;
  await drive.warp(node);
  const art=await read('assets/'+layouts[animals[0].art].file);
  await page.waitForFunction(source=>window.lab.frame.draws.some(d=>d.kind==='boss_sprite'&&d.source===source),art.source);
  await page.waitForFunction(key=>window.paintedSpriteSheets.has(key),'/assets/'+art.source+'#'+art.box.join(','));
  if(node==='fon-wp-50075')await page.locator('#game').screenshot({path:'evidence/fontaine-ray-game.png'});
 }
 await drive.warp('fontaine-field');
 await drive.walk(850);
 const operative=await read('assets/'+layouts['fatui-wind-operative'].file);
 await page.waitForFunction(key=>window.paintedSpriteSheets.has(key),'/assets/'+operative.source+'#'+operative.box.join(','));
 const hub='fontaine-hub',host='fon-wp-55784',water='erinnyes-root-waterway';
 const {quests}=await read('content/story-graph.json');
 const quest=quests.find(q=>q.id==='fon-erinnyes-root-water-survey');
 await drive.warp(host);
 const gate=nodes[host].exits.find(e=>e.to===water);
 await drive.walk(gate.x);
 await page.waitForFunction(to=>window.lab.frame.storyNearbyPortal?.to===to,water);
 assert.equal(await page.evaluate(()=>window.lab.frame.storyNearbyPortal.available),false);
 await drive.warp(hub);
 await drive.accept(quest.id);
 await drive.warp(host);
 const jelly=await read('assets/'+layouts['hat-jellyfish-blue'].file);
 const sheetKey='/assets/'+jelly.source+'#'+jelly.box.join(',');
 for(const [index,step] of quest.itinerary.entries()){
  if(step.kind==='arrive'){
   await drive.cross(step.node);
  }else{
   await drive.walk(step.x);
   await drive.changeHeight(step.y);
   if(step.node===water&&index===2){
    await page.waitForFunction(key=>window.paintedSpriteSheets.has(key),sheetKey);
    await page.waitForFunction(label=>window.lab.frame.draws.some(d=>d.kind==='text'&&d.text===label),step.label);
    const entry=page.getByRole('link',{name:'青紫のボウシクラゲ',exact:true});
    await entry.waitFor();
    const [gallery]=await Promise.all([page.waitForEvent('popup'),entry.click()]);
    await gallery.waitForFunction(()=>window.charactersGallery?.ready);
    assert.deepEqual(await gallery.locator('#cards article:not([hidden])').evaluateAll(cards=>cards.map(c=>c.dataset.id)),['hat-jellyfish-blue']);
    await gallery.close();
    await page.locator('#game').screenshot({path:'evidence/erinnyes-jelly-survey.png'});
   }
   await page.keyboard.press('KeyG');
  }
  await drive.count(quest.id,index+1);
 }
 await drive.warp(hub);
 await drive.report(quest.id);
 assert(await page.locator('#wildlifeSighting').isHidden());
 assert.deepEqual(errors,[]);
 console.log('Seven wildlife habitats seen in play; locked passage, five survey steps and report passed');
}finally{await browser.close()}
