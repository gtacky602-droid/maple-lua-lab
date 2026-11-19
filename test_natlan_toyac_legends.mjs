import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const nodes=Object.fromEntries(graph.nodes.map(node=>[node.id,node]));
const bal={host:'sites-hunt-73160',work:'toyac-rainbow-key-cave',arena:'toyac-balachko-inner-cave',quest:'natlan-rainbow-cave-keys'};
const coc={host:'nat-wp-77772',work:'toyac-electro-crystal-shore',arena:'toyac-cocijo-stone-ring',quest:'natlan-toyac-electro-crystals'};
const source='natlan-toyac-legend-poses-source-v1.png';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-gpu']});
const page=await browser.newPage({viewport:{width:1280,height:900}});
page.setDefaultTimeout(16000);
const drive=waypointDriver(page,nodes);
const errors=[],comparisons=[];
page.on('pageerror',error=>errors.push(error.message));
page.on('response',response=>{
 if(response.url().endsWith('/api/frame')&&!response.ok())errors.push('Frame HTTP '+response.status());
});

async function locked(to,reason){
 const from=await drive.node();
 const edge=nodes[from].exits.find(e=>e.to===to);
 await drive.walk(edge.x);
 await drive.changeHeight(edge.y??480);
 const handle=await page.waitForFunction(to=>{
  const gate=window.lab.frame.storyNearbyPortal;
  return gate?.to===to&&gate;
 },to);
 const portal=await handle.jsonValue();
 assert.equal(portal.available,false);
 assert.match(portal.reason,reason);
 await page.keyboard.press('KeyF');
 assert.equal(await drive.node(),from);
}

async function guide({work,arena}){
 await page.evaluate(()=>document.activeElement.blur());
 await page.keyboard.press('KeyM');
 const atlas=page.locator('#worldAtlas');
 await atlas.waitFor();
 await page.locator('#atlasLayer').selectOption('hunt');
 await page.waitForFunction(()=>window.lab.frame.worldMap?.layer==='hunt');
 await page.locator('#atlasField').selectOption(arena);
 await page.waitForFunction(expected=>{
  const current=window.lab.frame.worldMap?.guide;
  return current?.status==='ready'&&Object.values(current.stops??{}).map(stop=>stop.id).join()===expected;
 },[work,arena].join());
 await page.keyboard.press('Escape');
 await atlas.waitFor({state:'hidden'});
}

const read=()=>page.evaluate(source=>{
 const f=window.lab.frame;
 return {t:f.t,boss:f.fieldBoss,commands:f.commands,sprites:f.draws.filter(draw=>draw.source===source).length};
},source);
async function pause(value){
 await page.evaluate(()=>document.activeElement.blur());
 await page.keyboard.press('KeyP');
 await page.waitForFunction(value=>window.lab.frame.paused===value,value);
}
async function face(direction){
 await drive.walk((await drive.actor()).x+direction*24);
}
async function compare(name){
 await drive.walk(685);
 await page.waitForFunction(()=>window.lab.frame.fieldBoss?.x===842);
 await pause(true);
 await page.evaluate(async source=>{
  const img=new Image();
  img.src='assets/'+source;
  await img.decode();
 },source);
 const png=await read();
 assert.equal(png.sprites,1);
 const canvas=page.locator('#game'), mode=page.locator('#renderMode');
 await canvas.screenshot({path:'evidence/natlan-'+name+'-png.png'});
 await mode.selectOption('rect');
 await page.waitForFunction(n=>window.lab.frame.commands>n+20,png.commands);
 const full=await read();
 await mode.selectOption('h32c16');
 await page.waitForFunction(n=>window.lab.frame.commands<n,full.commands);
 const light=await read();
 assert.equal(light.t,png.t);
 assert.deepEqual(light.boss,png.boss);
 await canvas.screenshot({path:'evidence/natlan-'+name+'-16colors.png'});
 comparisons.push({name,pngCommands:png.commands,rectangleCommands:full.commands,lightCommands:light.commands});
 await mode.selectOption('sprite');
 await pause(false);
}

try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8988/');
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#importSave').setInputFiles('work/natlan-toyac-fixture.json');
 await drive.waitNode('natlan-hub');
 await drive.accept(bal.quest);
 await drive.accept(coc.quest);
 await drive.warp('nat-wp-72422');
 await drive.cross(bal.host);
 await drive.cross(bal.work);
 await locked(bal.arena,/鍵を2本/);
 const steps=graph.quests.find(q=>q.id===bal.quest).itinerary;
 for(const [i,step] of steps.entries()){
  if(i===0)continue;
  await drive.walk(step.x);
  await drive.changeHeight(step.y);
  await page.keyboard.press('KeyG');
  await drive.count(bal.quest,i+1);
 }
 await drive.cross(bal.host);
 await guide(bal);
 await drive.cross(bal.work);
 await drive.cross(bal.arena);
 await compare('balachko');
 await drive.cross(bal.work);
 await drive.cross(bal.host);

 await drive.warp(coc.host);
 await drive.cross(coc.work);
 await locked(coc.arena,/炎元素/);
 const crystals=nodes[coc.work].breakTargets;
 await drive.walk(crystals[2].x-55);
 await face(1);
 await page.keyboard.down('KeyJ');
 try{
  await page.waitForFunction(()=>window.lab.frame.storyNotice?.includes('通常攻撃では割れません'));
 }finally{
  await page.keyboard.up('KeyJ');
 }
 await page.keyboard.press('KeyE');
 await page.waitForFunction(()=>window.lab.frame.active===2);
 for(const [i,target] of [crystals[2],crystals[0],crystals[1]].entries()){
  await drive.walk(target.x+55);
  await face(-1);
  const expected=i===2?'3つ砕きました':(i+1)+' / 3';
  for(let attempt=0;attempt<5;attempt++){
   await page.keyboard.press('KeyK');
   try{
    await page.waitForFunction(label=>window.lab.frame.storyNotice?.includes(label),expected,{timeout:1400});
    break;
   }catch(error){
    if(error.name!=='TimeoutError'||attempt===4)throw error;
   }
  }
 }
 await drive.count(coc.quest,1);
 await drive.cross(coc.host);
 await guide(coc);
 await drive.cross(coc.work);
 await drive.cross(coc.arena);
 await compare('cocijo');
 await drive.cross(coc.work);
 await drive.cross(coc.host);
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/natlan-toyac-legends-browser.json',
  JSON.stringify({routes:drive.journeys,comparisons,errors},null,2)+'\n');
 console.log(JSON.stringify(comparisons));
}finally{
 await browser.close();
}
