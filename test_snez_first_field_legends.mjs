import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const nodes=Object.fromEntries(graph.nodes.map(node=>[node.id,node]));
const hub='snezhnaya-hub',bouts='sne-snow-sculptor-bouts',passage='sne-svetloredovka-cavern-check';
const ch={host:'sne-wp-100697',path:'sne-churin-snow-square',first:'sne-churin-apprentice-bout',
 second:'sne-churin-bragin-bout',arena:'sne-churin-snow-court'};
const ba={host:'sne-wp-100658',path:'sne-svetloredovka-ice-passage',arena:'sne-bandersnatch-ice-cavern'};
const fu={host:'sne-wp-100695',path:'sne-obsession-scar-upper-trail',arena:'sne-furiosa-domain-outlook'};
const source='snez-first-field-legend-poses-source-v1.png';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-gpu']});
const page=await browser.newPage({viewport:{width:1280,height:900}});
page.setDefaultTimeout(18000);
const drive=waypointDriver(page,nodes);
const canvas=page.locator('#game');
const errors=[],comparisons=[];
page.on('pageerror',error=>errors.push(error.message));
page.on('response',receive=>{
 if(receive.url().endsWith('/api/frame')&&!receive.ok())errors.push('Frame HTTP '+receive.status());
});

async function guide(stops,status){
 await page.evaluate(()=>document.activeElement.blur());
 await page.keyboard.press('KeyM');
 const atlas=page.locator('#worldAtlas');
 await atlas.waitFor();
 await page.locator('#atlasLayer').selectOption('hunt');
 await page.waitForFunction(()=>window.lab.frame.worldMap?.layer==='hunt');
 await page.locator('#atlasField').selectOption(stops.at(-1));
 await page.waitForFunction(({stops,status})=>{
  const guide=window.lab.frame.worldMap?.guide;
  return guide?.status===status&&Object.values(guide.stops??{}).map(leg=>leg.id).join()===stops.join();
 },{stops,status});
 await page.keyboard.press('Escape');
 await atlas.waitFor({state:'hidden'});
}
async function collect(quest,index){
 const step=graph.quests.find(item=>item.id===quest).itinerary[index];
 await drive.walk(step.x);
 await drive.changeHeight(step.y);
 await page.keyboard.press('KeyG');
 await drive.count(quest,index+1);
}
async function spar(count){
 await drive.walk(787);
 await page.keyboard.down('KeyJ');
 try{await drive.count(bouts,count)}
 finally{await page.keyboard.up('KeyJ')}
}
async function pause(value){
 await page.evaluate(()=>document.activeElement.blur());
 await page.keyboard.press('KeyP');
 await page.waitForFunction(value=>window.lab.frame.paused===value,value);
}
async function compare(name){
 await drive.walk(405);
 await page.waitForFunction(()=>window.lab.frame.fieldBoss?.x===830);
 await pause(true);
 const read=()=>page.evaluate(source=>{
  const f=window.lab.frame;
  return {t:f.t,boss:f.fieldBoss,commands:f.commands,sprites:f.draws.filter(d=>d.source===source).length};
 },source);
 const png=await read();
 assert.equal(png.sprites,1);
 assert.equal(png.boss.hp,png.boss.maxhp);
 await page.evaluate(async source=>{
  const img=new Image();
  img.src='assets/'+source;
  await img.decode();
 },source);
 const mode=page.locator('#renderMode');
 await canvas.screenshot({path:'evidence/snez-'+name+'-png.png'});
 await mode.selectOption('rect');
 await page.waitForFunction(n=>window.lab.frame.commands>n+20,png.commands);
 const full=await read();
 await mode.selectOption('h32c16');
 await page.waitForFunction(n=>window.lab.frame.commands<n,full.commands);
 const light=await read();
 assert.equal(light.t,png.t);
 assert.deepEqual(light.boss,png.boss);
 await canvas.screenshot({path:'evidence/snez-'+name+'-16colors.png'});
 comparisons.push({name,pngCommands:png.commands,rectangleCommands:full.commands,lightCommands:light.commands});
 await mode.selectOption('sprite');
 await pause(false);
}

try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8989/');
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#importSave').setInputFiles('work/snez-first-field-legends-fixture.json');
 await drive.waitNode(hub);
 await drive.accept(bouts);
 await drive.accept(passage);
 await drive.warp(ch.host);
 await guide([ch.path,ch.first,ch.second,ch.arena],'blocked');
 await drive.cross(ch.path);
 await collect(bouts,0);
 await drive.cross(ch.first);
 await spar(2);
 await drive.cross(ch.second);
 await spar(3);
 await drive.cross(ch.arena);
 await compare('churin');
 await drive.cross(ch.second);
 await page.waitForFunction(()=>window.lab.frame.total===0);
 await drive.cross(ch.first);
 await page.waitForFunction(()=>window.lab.frame.total===0);
 await drive.cross(ch.path);
 await drive.cross(ch.host);

 await drive.warp(ba.host);
 await guide([ba.path,ba.arena],'blocked');
 await drive.cross(ba.path);
 await collect(passage,0);
 await collect(passage,1);
 await drive.cross(ba.arena);
 await compare('bandersnatch');
 await drive.cross(ba.path);
 assert.equal((await drive.actor()).y,411);
 await drive.cross(ba.host);

 await drive.warp(fu.host);
 await guide([fu.path,fu.arena],'ready');
 await drive.cross(fu.path);
 await drive.cross(fu.arena);
 await compare('furiosa');
 await drive.cross(fu.path);
 await drive.cross(fu.host);
 assert.equal((await drive.actor()).y,395);
 assert.ok(!drive.journeys.some(route=>route.includes('sites-hunt-100707')));
 await drive.warp(hub);
 await drive.report(bouts);
 await drive.report(passage);
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/snez-first-field-legends-browser.json',
  JSON.stringify({routes:drive.journeys,comparisons,bothSparringRounds:true,clearedRoundsRemainEmpty:true,
   passageOpened:true,furiosaAt158Without159Domain:true,questsReported:true,errors},null,2)+'\n');
 console.log(JSON.stringify(comparisons));
}finally{
 await browser.close();
}
