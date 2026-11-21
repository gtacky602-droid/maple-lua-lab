import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const {nodes:story,quests}=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const nodes=Object.fromEntries(story.map(node=>[node.id,node]));
const lake=process.argv.includes('--lake');
const dry=process.argv.includes('--dry');
const manifest=dry?'sites-fontaine-dry-legends':lake?'sites-fontaine-lake-legends':'sites-branch-hunts';
const {legends,art_source:source}=JSON.parse(await fs.readFile('sources/map-research/'+manifest+'.json','utf8'));
const {fieldBosses}=JSON.parse(await fs.readFile('content/field-boss-spawns.json','utf8'));
const revisedChizhang=legends.some(legend=>legend.stage==='chizhang-legend-terrace')&&
 fieldBosses.find(b=>b.node==='chizhang-legend-terrace').artRevision===3;
const chizhangArt={};
if(revisedChizhang){
 for(const element of ['ember','frost']){
  chizhangArt[element]={};
  for(const pose of ['idle','brace','strike']){
   chizhangArt[element][pose]=JSON.parse(await fs.readFile(`assets/chizhang-${element}-field-${pose}-sprites-v3.json`,'utf8'));
  }
 }
}
const pngTags=dry?['yseut','gravity-device','rocky','liam','deianeira']:lake?['vivianne','ninianne']:['chizhang','cineas'];
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-gpu']});
const page=await browser.newPage({viewport:{width:1280,height:900}});
page.setDefaultTimeout(24000);
const drive=waypointDriver(page,nodes,{walkTimeout:22000});
const canvas=page.locator('#game');
const errors=[];
const requestedLegendSheets=[];
const chizhangSources=[...new Set(Object.values(chizhangArt).flatMap(poses=>Object.values(poses).map(asset=>asset.source)))];
page.on('request',req=>{
 const name=new URL(req.url()).pathname.split('/').at(-1);
 if(/legend-poses-source-v[12346][.]png$/.test(name)||chizhangSources.includes(name))requestedLegendSheets.push(req.url());
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

const current=sources=>page.evaluate(sources=>{
 const f=window.lab.frame;
 return {commands:f.commands,t:f.t,warnings:f.fieldBoss?.warnings??[],
  bodies:f.draws.filter(d=>sources.includes(d.source)).length};
},sources);

async function checkStrike(move,art,name){
 await page.waitForFunction(move=>{
  const f=window.lab.frame.fieldBoss;
  return f?.move===move&&f.warnings?.some(w=>w.active);
 },move);
 await pause(true);
 assert(await page.evaluate(({source,box})=>window.lab.frame.draws.some(d=>
  d.source===source&&JSON.stringify(d.box)===JSON.stringify(box)&&d.h===105&&d.y===480),art));
 await canvas.screenshot({path:`evidence/chizhang-${name}-strike.png`});
}

try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8978/');
 await page.waitForFunction(()=>window.lab?.frame);
 assert.deepEqual(requestedLegendSheets,[]);
 const sizes={};
 for (const [i,legend] of legends.entries()) {
  const tag=pngTags[i];
  const chizhang=revisedChizhang&&tag==='chizhang';
  const sources=chizhang?chizhangSources:[source];
  const capture=lake?tag+'-legend-a':chizhang?'chizhang-shared-legend':tag+'-legend';
  const label=page.locator('#fieldBossLabel');
  const approach=legend.approach??[legend.host];
  const fixture=legend.approach?'before-report-fixture':'fixture';
  const checkpoint=nodes[legend.stage].checkpoint;
  await page.locator('#importSave').setInputFiles(`work/${legend.stage}-${fixture}.json`);
  await drive.waitNode(checkpoint);
  if(legend.approach){
   const quest=quests.find(q=>q.id===legend.prerequisite);
   const [,inspect]=quest.itinerary;
   await drive.warp(approach[0]);
   await drive.cross(legend.host);
   const gate=nodes[legend.host].exits.find(e=>e.to===legend.stage);
   await drive.walk(gate.x);
   await drive.changeHeight(gate.y);
   await page.waitForFunction(id=>{
    const gate=window.lab.frame.storyNearbyPortal;
    return gate?.to===id&&!gate.available&&gate.reason.includes('報告');
   },legend.stage);
   await page.keyboard.press('KeyF');
   assert.equal(await drive.node(),legend.host);
   await drive.warp(checkpoint);
   await drive.accept(quest.id);
   await drive.warp(approach[0]);
   await drive.cross(legend.host);
   await drive.count(quest.id,1);
   await drive.walk(inspect.x);
   await drive.changeHeight(inspect.y);
   await page.keyboard.press('KeyG');
   await drive.count(quest.id,2);
   await drive.cross(approach[0]);
   await drive.count(quest.id,3);
   await drive.warp(checkpoint);
   await drive.report(quest.id);
  }
  await drive.warp(approach[0]);
  for(const step of approach.slice(1))await drive.cross(step);
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
  await drive.walk(dry?700:lake?620:i===0?580:764);
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
  assert.ok(requestedLegendSheets.some(url=>sources.some(name=>url.endsWith('/'+name))));
  await page.evaluate(async sources=>{
   await Promise.all(sources.map(source=>{
    const sprite=new Image();
    sprite.src='assets/'+source;
    return sprite.decode();
   }));
  },sources);
  const png=await current(sources);
  assert.equal(png.bodies,legend.members);
  await canvas.screenshot({path:`evidence/${capture}-field.png`});
  if(i===0||lake){
   const mode=page.locator('#renderMode');
   let standard,light;
   await mode.selectOption('rect');
   await page.waitForFunction(pngCommands=>window.lab.frame.commands>pngCommands+200,png.commands);
   standard=await current(sources);
   await mode.selectOption('h32c16');
   await page.waitForFunction(old=>window.lab.frame.commands<old,standard.commands);
   light=await current(sources);
   assert.equal(png.t,light.t);
   assert.ok(standard.commands>light.commands&&light.commands>png.commands);
   assert.deepEqual(standard.warnings,light.warnings);
   sizes[tag]={png:png.commands,legacy:standard.commands,h32c16:light.commands};
   await canvas.screenshot({path:`evidence/${capture}-light.png`});
   await mode.selectOption('sprite');
  }
  if(chizhang){
   await pause(false);
   await checkStrike('LC01',chizhangArt.ember.strike,'ember');
   await pause(false);
   await drive.walk(760);
   await checkStrike('LC02',chizhangArt.frost.strike,'frost');
  }
  await pause(false);
  await drive.cross(legend.host);
  if(legend.approach)assert.equal(await page.evaluate(()=>Boolean(window.lab.frame.storySwim)),true);
  await page.waitForFunction(()=>!window.lab.frame.fieldBoss);
  await drive.cross(legend.stage);
  await drive.walk(dry?370:lake?580:i===0?450:525);
  await page.waitForFunction(id=>{
   const b=window.lab.frame.fieldBoss;
   return b?.id===id&&b.hp===b.maxhp;
  },legend.id);
  await drive.cross(legend.host);
  console.log(tag+' map, warning, portraits and manual return passed.');
 }
 const gallery=new URL('/bosses-art.html',page.url());
 gallery.searchParams.set('q',dry?'ロッキー':lake?'湖辺の':'赤璋巡岳府君');
 await page.goto(gallery.href);
 await page.waitForFunction(()=>window.charactersGallery?.ready,null,{timeout:60000});
 const visibleCards=page.locator('#cards article:not([hidden])');
 if(dry){
  assert.equal(await visibleCards.count(),1);
  assert.equal(await visibleCards.locator('canvas').count(),2);
  await page.locator('#assetSearch').fill('ディアンナラ');
  assert.equal(await visibleCards.count(),1);
 }else{
  const revisions=lake?6:2;
  const visible=revisions*2+(revisedChizhang?2:0);
  assert.equal(await visibleCards.count(),visible);
  assert.equal(await visibleCards.locator('canvas').count(),visible*2);
  await page.locator('#assetSearch').fill(lake?'ニニアン':'シネアス');
  assert.equal(await visibleCards.count(),revisions);
  const titles=await visibleCards.locator('h2').allTextContents();
  const labels=lake?['初稿','第2稿','第3稿・一つ目','第4稿・水の陰影','第5稿A・本編表示中','第5稿B・斜めの奥行き']:['初稿','改稿'];
  titles.forEach((title,index)=>assert.ok(title.endsWith('（'+labels[index]+'）')));
  assert.equal(await visibleCards.locator('canvas').count(),revisions*2);
 }
 assert.deepEqual(errors,[]);
 const log=dry?'sites-fontaine-dry-legends-browser':lake?'sites-fontaine-lake-legends-a-browser':'sites-branch-legends-browser';
 await fs.writeFile('evidence/'+log+'.json',JSON.stringify({
  originalSpriteSheet:source, ...(revisedChizhang?{chizhangSources,sharedBodyStrikesDisplayed:true}:{}),
  bothOptionalEntriesFromAtlas:true,
  sameFrameComparisonAndGallery:true, ...(dry?{waterIntakeQuestAndReturn:true}:{galleryShowsBothArtRevisions:true}), optionalSheetsDeferredUntilEncounter:true, bothRetreatsAndReentryPassed:true,
  measuredDrawCommandsSamePausedFrame:sizes, errors
 },null,2)+'\n');
}catch(error){
 console.error(await page.evaluate(()=>({node:window.lab?.frame.story?.node,
  boss:window.lab?.frame.fieldBoss, status:document.querySelector('#status')?.textContent})));
 throw error;
}finally{
 await browser.close();
}
