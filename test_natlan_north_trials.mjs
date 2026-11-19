import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const nodes=Object.fromEntries(graph.nodes.map(node=>[node.id,node]));
const quests=Object.fromEntries(graph.quests.map(quest=>[quest.id,quest]));
const t={host:'nat-wp-72434',lower:'nat-wp-72441',basin:'sulfurous-resonant-basin',cave:'sulfurous-totem-cave',
 arena:'night-trial-tlatzacuilotl',quest:'natlan-sulfurous-resonant-stones'};
const i={host:'nat-wp-72436',bank:'witztli-sealed-stone-bank',arena:'night-trial-ichcahuipilli',quest:'natlan-witztli-three-echoes'};
const source='natlan-north-trial-poses-source-v1.png';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-gpu']});
const page=await browser.newPage({viewport:{width:1280,height:900}});
page.setDefaultTimeout(16000);
const drive=waypointDriver(page,nodes);
const errors=[],comparisons=[];
page.on('pageerror',error=>errors.push(error.message));
page.on('response',response=>{
 if(response.url().endsWith('/api/frame')&&!response.ok())errors.push('Frame HTTP '+response.status());
});

async function stateAtGate(to){
 const from=await drive.node();
 const edge=nodes[from].exits.find(e=>e.to===to);
 await drive.walk(edge.x);
 await drive.changeHeight(edge.y??480);
 const gate=await page.waitForFunction(to=>{
  const current=window.lab.frame.storyNearbyPortal;
  return current?.to===to&&current;
 },to);
 return gate.jsonValue();
}
async function collect(spot){
 await drive.walk(spot.x);
 await drive.changeHeight(spot.y);
 await page.keyboard.press('KeyG');
}
async function checkAtlas(arena,status,modes){
 await page.evaluate(()=>document.activeElement.blur());
 await page.keyboard.press('KeyM');
 const atlas=page.locator('#worldAtlas');
 await atlas.waitFor();
 await page.locator('#atlasLayer').selectOption('hunt');
 await page.waitForFunction(()=>window.lab.frame.worldMap?.layer==='hunt');
 await page.locator('#atlasField').selectOption(arena);
 await page.waitForFunction(([status,modes])=>{
  const route=window.lab.frame.worldMap?.guide;
  return route?.status===status&&Object.values(route.stops??{}).map(p=>p.mode).join()===modes;
 },[status,modes.join()]);
 await page.keyboard.press('Escape');
 await atlas.waitFor({state:'hidden'});
}

async function pause(value){
 await page.evaluate(()=>document.activeElement.blur());
 await page.keyboard.press('KeyP');
 await page.waitForFunction(value=>window.lab.frame.paused===value,value);
}
async function compare(name){
 await drive.walk(635);
 await page.waitForFunction(()=>window.lab.frame.fieldBoss?.x===845);
 await pause(true);
 const frame=()=>page.evaluate(source=>{
  const f=window.lab.frame;
  return {t:f.t,boss:f.fieldBoss,commands:f.commands,sprites:f.draws.filter(d=>d.source===source).length};
 },source);
 const png=await frame();
 assert.equal(png.sprites,1);
 await page.evaluate(async source=>{
  const img=new Image();img.src='assets/'+source;await img.decode();
 },source);
 const mode=page.locator('#renderMode'),canvas=page.locator('#game');
 await canvas.screenshot({path:'evidence/natlan-'+name+'-png.png'});
 await mode.selectOption('rect');
 await page.waitForFunction(n=>window.lab.frame.commands>n+20,png.commands);
 const full=await frame();
 await mode.selectOption('h32c16');
 await page.waitForFunction(n=>window.lab.frame.commands<n,full.commands);
 const light=await frame();
 assert.equal(light.t,png.t);
 assert.deepEqual(light.boss,png.boss);
 await canvas.screenshot({path:'evidence/natlan-'+name+'-16colors.png'});
 comparisons.push({name,pngCommands:png.commands,rectangleCommands:full.commands,lightCommands:light.commands});
 await mode.selectOption('sprite');
 await pause(false);
}

try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8989/');
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#importSave').setInputFiles('work/natlan-north-trials-fixture.json');
 await drive.waitNode('natlan-hub');
 await drive.accept(t.quest);
 await drive.accept(i.quest);
 await drive.warp(t.host);
 await checkAtlas(t.arena,'blocked',['lift','walk','walk','night']);
 await drive.cross(t.lower);
 await drive.cross(t.basin);
 const rock=await stateAtGate(t.cave);
 assert.equal(rock.available,false);
 assert.match(rock.reason,/刻印板/);
 const resonance=nodes[t.basin].resonance;
 await collect(resonance.stones[0]);
 await page.waitForFunction(()=>window.lab.frame.storyNotice?.includes('消えました'));
 for(const index of resonance.order)await collect(resonance.stones[index-1]);
 await drive.count(t.quest,1);
 await drive.cross(t.cave);
 await drive.cross(t.arena);
 await compare('tlatzacuilotl');
 await drive.cross(t.cave);

 await drive.warp(i.host);
 await drive.cross(i.bank);
 const seal=await stateAtGate(i.arena);
 assert.equal(seal.available,false);
 assert.match(seal.reason,/三つの光/);
 const paths=Object.fromEntries(quests[i.quest].paths.map(path=>[path.id,path.steps[0]]));
 for(const name of ['crystal','ledge','root']){
  const spot=paths[name];
  await drive.cross(spot.node);
  await collect(spot);
  await page.waitForFunction(()=>window.lab.frame.draws?.some(draw=>draw.color==='#bcfddb'));
  await drive.cross(i.bank);
 }
 await drive.count(i.quest,2);
 await checkAtlas(i.arena,'ready',['night']);
 await stateAtGate(i.arena);
 await page.waitForFunction(()=>window.lab.frame.storyNearbyPortal?.available);
 await page.locator('#game').screenshot({path:'evidence/natlan-witztli-three-lights.png'});
 await drive.cross(i.arena);
 await compare('ichcahuipilli');
 await drive.cross(i.bank);
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/natlan-north-trials-browser.json',
  JSON.stringify({routes:drive.journeys,comparisons,wrongCrystalOrderRejected:true,threeLightsEscorted:true,errors},null,2)+'\n');
 console.log(JSON.stringify(comparisons));
}finally{
 await browser.close();
}
