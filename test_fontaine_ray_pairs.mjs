import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const nodes=Object.fromEntries(graph.nodes.map(node=>[node.id,node]));
const cases=[
 {host:'fon-wp-50075',stage:'fairy-knight-twins-legend-court',tag:'fairy-knight-twins',
  title:'双生妖精の騎士',names:['アンジェリカ','ミドロ'],move:'FW31'},
 {host:'fon-wp-50071',stage:'swords-of-the-gorge-legend-rift',tag:'swords-of-the-gorge',
  title:'深谷の剣',names:['コルタナ','モーグレイ'],move:'FW34'},
];
const source='fontaine-ray-pair-poses-source-v1.png';
const root=process.env.LAB_URL||'http://127.0.0.1:8983/';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-gpu']});
const page=await browser.newPage({viewport:{width:1280,height:900}});
page.setDefaultTimeout(18000);
const drive=waypointDriver(page,nodes,{walkTimeout:18000});
const errors=[], requests=[];
page.on('pageerror',error=>errors.push(error.message));
page.on('response',r=>{if(r.url().endsWith('/api/frame')&&!r.ok())errors.push('Frame HTTP '+r.status());});
page.on('request',r=>{if(new URL(r.url()).pathname.endsWith('/'+source))requests.push(r.url());});

const read=()=>page.evaluate(asset=>{
 const f=window.lab.frame;
 return {t:f.t,commands:f.commands,boss:f.fieldBoss,paused:f.paused,swim:f.storySwimCombat,
  rays:f.draws.filter(d=>d.source===asset)};
},source);
const pause=async state=>{
 await page.evaluate(()=>document.activeElement.blur());
 await page.keyboard.press('KeyP');
 await page.waitForFunction(state=>window.lab.frame.paused===state,state);
};

try {
 await page.goto(root);
 await page.waitForFunction(()=>window.lab?.frame);
 assert.equal(requests.length,0);
 await page.locator('#importSave').setInputFiles('work/fontaine-ray-pairs-fixture.json');
 await drive.waitNode('fontaine-hub');

 const metrics={};
 const canvas=page.locator('#game'), mode=page.locator('#renderMode');
 for(const {host,stage,tag,names,move} of cases){
  await drive.warp(host);
  await page.keyboard.press('KeyM');
  const atlas=page.locator('#worldAtlas');
  await atlas.waitFor();
  await page.locator('#atlasLayer').selectOption('hunt');
  await page.locator('#atlasField').selectOption(stage);
  await page.waitForFunction(stage=>window.lab.frame.worldMap?.guide?.stops[0]?.id===stage,stage);
  await page.keyboard.press('Escape');
  await atlas.waitFor({state:'hidden'});
  await drive.cross(stage);
  await page.waitForFunction(()=>window.lab.frame.storySwimCombat);
  assert.match(await page.locator('#fieldSwimHelp').textContent(),/水撃.*急回避/);
  assert.equal(await page.locator('#touchSwimGuard').evaluate(b=>b.hidden),true);

  await drive.walk(650);
  await page.waitForFunction(move=>window.lab.frame.fieldBoss?.move===move,move);
  await pause(true);
  assert.ok(requests.length>0);
  await page.evaluate(async source=>{
   const img=new Image();
   img.src='assets/'+source;
   await img.decode();
  },source);
  const png=await read();
  assert.equal(png.rays.length,2);
  assert.deepEqual(png.boss.bodies.map(body=>body.name),names);
  const label=await page.locator('#fieldBossLabel').textContent();
  for(const name of names)assert.ok(label.includes(name));
  assert.ok(!label.includes('undefined'));
  assert.ok(png.boss.bodies[1].y-png.boss.bodies[0].y>110);
  assert.deepEqual(png.boss.warnings.map(w=>w.sourceId),png.boss.bodies.map(body=>body.id));
  await canvas.screenshot({path:'evidence/'+tag+'-field.png'});
  await mode.selectOption('rect');
  await page.waitForFunction(n=>window.lab.frame.commands>n+200,png.commands);
  const standard=await read();
  await mode.selectOption('h32c16');
  await page.waitForFunction(n=>window.lab.frame.commands<n,standard.commands);
  const light=await read();
  assert.equal(light.t,png.t);
  assert.equal(standard.t,png.t);
  assert.deepEqual(png.boss.warnings,light.boss.warnings);
  assert.deepEqual(png.boss.bodies,light.boss.bodies);
  await canvas.screenshot({path:'evidence/'+tag+'-light.png'});

  await mode.selectOption('sprite');
  await pause(false);
  await drive.walk(670);
  await drive.changeHeight((await read()).boss.y+28);
  const hp=(await read()).boss.hp;
  await page.keyboard.down('KeyJ');
  try{
   await page.waitForFunction(hp=>window.lab.frame.fieldBoss?.hp<hp,hp);
  }finally{await page.keyboard.up('KeyJ')}
  await drive.cross(host);
  assert.equal((await drive.actor()).y,nodes[host].exits.find(e=>e.to===stage).y);
  assert.equal((await read()).swim,undefined);
  await drive.cross(stage);
  await drive.walk(350);
  await page.waitForFunction(()=>{
   const boss=window.lab.frame.fieldBoss;
   return boss?.bodies?.length===2&&boss.hp===boss.maxhp;
  });
  await drive.cross(host);
  metrics[tag]={png:png.commands,standard:standard.commands,light:light.commands,
   members:names,bladeSources:png.boss.warnings.map(w=>w.sourceId)};
  console.log(tag+' map, visible pair, water blade preview and retry passed.');
 }

 const gallery=new URL('/bosses-art.html',root);
 gallery.searchParams.set('q',cases[0].title);
 await page.goto(gallery.href);
 await page.waitForFunction(()=>window.charactersGallery?.ready,null,{timeout:60000});
 const cards=page.locator('#cards article:not([hidden])');
 assert.equal(await cards.count(),2);
 await page.locator('#assetSearch').fill(cases[1].title);
 assert.equal(await cards.count(),2);
 await page.selectOption('#profile','h48c32');
 await page.selectOption('#profile','h32c16');
 assert.equal(await cards.locator('canvas').count(),4);
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/fontaine-ray-pairs-browser.json',JSON.stringify({
  bothRoutesFromAtlas:true,keyboardPulseAndRetreat:true,reentryAtFullSharedHealth:true,
  sameFrameArtAndWarnings:true,profileCounts:metrics,allFourGalleryEntries:true,errors
 },null,2)+'\n');
} catch(error) {
 console.error({frame:await read(),node:await drive.node(),actor:await drive.actor()});
 throw error;
} finally {
 await browser.close();
}
