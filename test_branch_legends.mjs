import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const {nodes:story}=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const nodes=Object.fromEntries(story.map(node=>[node.id,node]));
const lake=process.argv.includes('--lake');
const manifest=lake?'sites-fontaine-lake-legends':'sites-branch-hunts';
const {legends,art_source:source}=JSON.parse(await fs.readFile('sources/map-research/'+manifest+'.json','utf8'));
const pngTags=lake?['vivianne','ninianne']:['chizhang','cineas'];
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-gpu']});
const page=await browser.newPage({viewport:{width:1280,height:900}});
page.setDefaultTimeout(24000);
const drive=waypointDriver(page,nodes,{walkTimeout:22000});
const canvas=page.locator('#game');
const errors=[];
const requestedLegendSheets=[];
page.on('request',req=>{
 if(/(?:legend-poses-source-v2|legend-poses-source-v1)[.]png$/.test(new URL(req.url()).pathname))requestedLegendSheets.push(req.url());
});
page.on('pageerror',err=>errors.push(err.message));
page.on('response',res=>{
 if(res.url().endsWith('/api/frame')&&!res.ok())errors.push('Frame HTTP '+res.status());
});

async function pause(value) {
 await page.evaluate(()=>document.activeElement.blur());
 await page.keyboard.press('KeyP');
 await page.waitForFunction(value=>window.lab.frame.paused===value,value);
}

const current=()=>page.evaluate(source=>{
 const f=window.lab.frame;
 return {commands:f.commands,t:f.t,warnings:f.fieldBoss?.warnings??[],
  bodies:f.draws.filter(d=>d.source===source).length};
},source);

try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8977/');
 await page.waitForFunction(()=>window.lab?.frame);
 assert.deepEqual(requestedLegendSheets,[]);
 const sizes={};
 for (const [i,legend] of legends.entries()) {
  const tag=pngTags[i];
  const label=page.locator('#fieldBossLabel');
  await page.locator('#importSave').setInputFiles(`work/${legend.stage}-fixture.json`);
  await drive.waitNode(nodes[legend.stage].checkpoint);
  await drive.warp(legend.host);
  await page.keyboard.press('KeyM');
  await page.locator('#worldAtlas').waitFor();
  await page.locator('#atlasLayer').selectOption('hunt');
  await page.waitForFunction(()=>window.lab.frame.worldMap?.layer==='hunt');
  await page.locator('#atlasField').selectOption(legend.stage);
  await page.waitForFunction(id=>window.lab.frame.worldMap?.guide?.stops[0]?.id===id,legend.stage);
  await page.keyboard.press('Escape');
  await page.locator('#worldAtlas').waitFor({state:'hidden'});

  await drive.cross(legend.stage);
  assert.equal(await page.evaluate(()=>Boolean(window.lab.frame.storySwim)),false);
  await drive.walk(lake?620:i===0?580:764);
  await page.waitForFunction(id=>window.lab.frame.fieldBoss?.id===id,legend.id);
  await label.waitFor();
  if(legend.members===2){
   assert.match(await label.textContent(),/炎①.*氷②/);
   assert.doesNotMatch(await label.textContent(),/undefined/);
  }
  await page.waitForFunction(wave=>{
   const warning=window.lab.frame.fieldBoss?.warnings?.[0];
   return warning && (!wave || warning.active && warning.activeRight-warning.activeLeft<warning.right-warning.left);
  }, tag==='vivianne');
  await pause(true);
  assert.ok(requestedLegendSheets.some(url=>url.endsWith('/'+source)));
  await page.evaluate(async source=>{
   const sprite=new Image();
   sprite.src='assets/'+source;
   await sprite.decode();
  },source);
  const png=await current();
  assert.equal(png.bodies,legend.members);
  await canvas.screenshot({path:`evidence/${tag}-legend-field.png`});
  if(i===0){
   const mode=page.locator('#renderMode');
   let standard,light;
   await mode.selectOption('rect');
   await page.waitForFunction(pngCommands=>window.lab.frame.commands>pngCommands+200,png.commands);
   standard=await current();
   await mode.selectOption('h32c16');
   await page.waitForFunction(old=>window.lab.frame.commands<old,standard.commands);
   light=await current();
   assert.equal(png.t,light.t);
   assert.ok(standard.commands>light.commands&&light.commands>png.commands);
   assert.deepEqual(standard.warnings,light.warnings);
   sizes[tag]={png:png.commands,legacy:standard.commands,h32c16:light.commands};
   await canvas.screenshot({path:`evidence/${tag}-legend-light.png`});
   await mode.selectOption('sprite');
  }
  await pause(false);
  await drive.cross(legend.host);
  await page.waitForFunction(()=>!window.lab.frame.fieldBoss);
  await drive.cross(legend.stage);
  await drive.walk(lake?580:i===0?450:525);
  await page.waitForFunction(id=>{
   const b=window.lab.frame.fieldBoss;
   return b?.id===id&&b.hp===b.maxhp;
  },legend.id);
  await drive.cross(legend.host);
  console.log(tag+' map, warning, portraits and manual return passed.');
 }
 const gallery=new URL('/bosses-art.html',page.url());
 gallery.searchParams.set('q',lake?'湖辺の':'赤璋巡岳府君');
 await page.goto(gallery.href);
 await page.waitForFunction(()=>window.charactersGallery?.ready,null,{timeout:60000});
 const visibleCards=page.locator('#cards article:not([hidden])');
 assert.equal(await visibleCards.count(),4);
 assert.equal(await visibleCards.locator('canvas').count(),8);
 await page.locator('#assetSearch').fill(lake?'ニニアン':'シネアス');
 assert.equal(await visibleCards.count(),2);
 assert.deepEqual((await visibleCards.locator('h2').allTextContents()).map(title=>title.slice(-3)),['初稿）','改稿）']);
 assert.equal(await visibleCards.locator('canvas').count(),4);
 if(lake)await page.screenshot({path:'evidence/lake-legend-art-v1-v2-gallery.png',fullPage:true});
 assert.deepEqual(errors,[]);
 const log=lake?'sites-fontaine-lake-legends-browser':'sites-branch-legends-browser';
 await fs.writeFile('evidence/'+log+'.json',JSON.stringify({
  originalSpriteSheet:source, bothOptionalEntriesFromAtlas:true,
  sameFrameComparisonAndGallery:true, galleryShowsBothArtRevisions:true, optionalSheetsDeferredUntilEncounter:true, bothRetreatsAndReentryPassed:true,
  measuredDrawCommandsSamePausedFrame:sizes, errors
 },null,2)+'\n');
}catch(error){
 console.error(await page.evaluate(()=>({node:window.lab?.frame.story?.node,
  boss:window.lab?.frame.fieldBoss, status:document.querySelector('#status')?.textContent})));
 throw error;
}finally{
 await browser.close();
}
