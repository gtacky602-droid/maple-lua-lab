import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const {nodes:story}=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const nodes=Object.fromEntries(story.map(node=>[node.id,node]));
const cases=[
 {host:'fon-wp-50073',stage:'fading-veteran-legend-wreck',tag:'fading-veteran',name:'消えゆく老兵'},
 {host:'fon-wp-50062',stage:'dobharcu-legend-garden',tag:'dobharcu',name:'隠者の王・ドアーチュ'},
];
const source='fontaine-echo-poses-source-v1.png';
const root=process.env.LAB_URL||'http://127.0.0.1:8984/';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-gpu']});
const page=await browser.newPage({viewport:{width:1280,height:900}});
page.setDefaultTimeout(18000);
const drive=waypointDriver(page,nodes,{walkTimeout:20000});
const requests=[], errors=[];
page.on('pageerror',error=>errors.push(error.message));
page.on('response',r=>{if(r.url().endsWith('/api/frame')&&!r.ok())errors.push('Frame HTTP '+r.status());});
page.on('request',r=>{if(new URL(r.url()).pathname.endsWith('/'+source))requests.push(r.url());});

const read=()=>page.evaluate(src=>{
 const f=window.lab?.frame;
 return f&&{t:f.t,commands:f.commands,boss:f.fieldBoss,sonar:f.storySwimCombat?.sonar,
  art:f.draws.some(d=>d.source===src),
  trace:f.draws.some(d=>d.kind==='effect'&&d.color==='#eff0ad')};
},source);
async function pause(value){
 await page.evaluate(()=>document.activeElement.blur());
 await page.keyboard.press('KeyP');
 await page.waitForFunction(value=>window.lab.frame.paused===value,value);
}

try{
 await page.goto(root);
 await page.waitForFunction(()=>window.lab?.frame);
 assert.equal(requests.length,0);
 await page.locator('#importSave').setInputFiles('work/fontaine-echo-fixture.json');
 await drive.waitNode('fontaine-hub');
 const mode=page.locator('#renderMode'), canvas=page.locator('#game');
 const extra=page.locator('#touchSwimGuard'), help=page.locator('#fieldSwimHelp');
 const results={};

 for(const {host,stage,tag,name} of cases){
  await drive.warp(host);
  await page.keyboard.press('KeyM');
  const atlas=page.locator('#worldAtlas');
  await atlas.waitFor();
  await page.locator('#atlasLayer').selectOption('hunt');
  await page.waitForFunction(()=>window.lab.frame.worldMap?.layer==='hunt');
  await page.locator('#atlasField').selectOption(stage);
  await page.waitForFunction(stage=>window.lab.frame.worldMap?.guide?.stops[0]?.id===stage,stage);
  await page.keyboard.press('Escape');
  await atlas.waitFor({state:'hidden'});

  await drive.cross(stage);
  await page.waitForFunction(()=>window.lab.frame.storySwimCombat?.sonar);
  assert.equal(await extra.evaluate(button=>button.hidden),false);
  assert.equal((await extra.textContent()).trim(),'探知');
  assert.match(await help.textContent(),/波紋.*Kで探知/);
  await drive.walk(648);
  await page.waitForFunction(src=>{
   const f=window.lab.frame;
   return f.storySwimCombat?.sonar?.hidden&&!f.draws.some(d=>d.source===src)&&
    f.draws.some(d=>d.kind==='effect'&&d.color==='#eff0ad');
  },source);
  await pause(true);
  const hidden=await read();
  assert.equal(hidden.boss.name,name);
  assert.ok(hidden.sonar.hidden&&!hidden.art&&hidden.trace);
  assert.ok(hidden.boss.warnings.length>0);
  await canvas.screenshot({path:'evidence/'+tag+'-concealed.png'});
  await pause(false);
  await page.keyboard.press('KeyK');
  await page.waitForFunction(()=>window.lab.frame.storySwimCombat?.sonar?.exposed>0);
  await pause(true);
  await page.evaluate(async asset=>{
   const img=new Image();
   img.src='assets/'+asset;
   await img.decode();
  },source);
  const png=await read();
  assert.ok(png.art&&png.sonar.exposed>0&&!png.sonar.hidden);
  assert.match(await help.textContent(),/Jで反撃 残り\d+\.\d秒/);
  assert.equal(Object.values(png.boss.warnings).length,0);
  assert.ok(requests.length>0);
  await canvas.screenshot({path:'evidence/'+tag+'-revealed.png'});

  await mode.selectOption('rect');
  await page.waitForFunction(previous=>window.lab.frame.commands>previous+200,png.commands);
  const standard=await read();
  await mode.selectOption('h32c16');
  await page.waitForFunction(previous=>window.lab.frame.commands<previous,standard.commands);
  const light=await read();
  assert.equal(png.t,standard.t);
  assert.equal(png.t,light.t);
  assert.deepEqual(light.sonar,png.sonar);
  assert.deepEqual(light.boss.warnings,png.boss.warnings);
  await canvas.screenshot({path:'evidence/'+tag+'-light.png'});

  await mode.selectOption('sprite');
  await pause(false);
  const hp=(await read()).boss.hp;
  await page.keyboard.down('KeyJ');
  try{
   await page.waitForFunction(hp=>window.lab.frame.fieldBoss?.hp<hp,hp);
  }finally{await page.keyboard.up('KeyJ')}
  await drive.cross(host);
  assert.equal((await drive.actor()).y,nodes[host].exits.find(e=>e.to===stage).y);
  assert.equal((await read()).sonar,undefined);
  assert.equal(await extra.evaluate(button=>button.hidden),true);
  await drive.cross(stage);
  await drive.walk(361);
  await page.waitForFunction(()=>{
   const f=window.lab.frame, boss=f.fieldBoss;
   return boss&&boss.hp===boss.maxhp&&!f.storySwimCombat?.sonar.exposed;
  });
  await drive.cross(host);
  results[tag]={png:png.commands,legacy:standard.commands,h32c16:light.commands};
  console.log(tag+' map, K reveal, J retaliation, drawing and retry passed.');
 }

 const gallery=new URL('bosses-art.html',root);
 gallery.searchParams.set('q',cases[0].name);
 await page.goto(gallery.href);
 await page.waitForFunction(()=>window.charactersGallery?.ready,null,{timeout:60000});
 const cards=page.locator('#cards article:not([hidden])');
 assert.equal(await cards.count(),1);
 await page.locator('#assetSearch').fill(cases[1].name);
 assert.equal(await cards.count(),1);
 assert.equal(await cards.locator('canvas').count(),2);
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/fontaine-echo-browser.json',JSON.stringify({
   routesThroughAtlas:true,sonarKeyHidesAttacksAndRestoresArt:true,normalPulseAfterReveal:true,
   sameFrameRenderModes:true,retreatResetsArena:true,readableSonarTouchControl:true,galleryBoth:true,commands:results,errors
 },null,2)+'\n');
}catch(error){
 console.error({frame:await read(),node:await drive.node(),actor:await drive.actor()});
 throw error;
}finally{
 await browser.close();
}
