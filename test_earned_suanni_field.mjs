import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import {captureRectTransfer} from './tools/browser_rect_transfer.mjs';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const source=process.env.SUANNI_EARNED_SAVE||'work/earned-cryo-cube/complete.json';
const out=process.env.SUANNI_OUTPUT||'work/earned-suanni';
const url=process.env.LAB_URL||'http://127.0.0.1:51356/';
const bytes=await fs.readFile(source),input=JSON.parse(bytes);
const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const [hub,approach,arena]=['chenyu-camp','chenyu-depth','suanni-field-sanctum'];
const boss='boss-26190101',quest='suanni-commission';
assert.ok(!input.endgame.bosses[boss]&&!input.story.quests[quest]);
await fs.mkdir(out,{recursive:true});

const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1200,height:940}});
page.setDefaultTimeout(22000);
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
const drive=waypointDriver(page,Object.fromEntries(graph.nodes.map(node=>[node.id,node])));
const canvas=page.locator('#game'),quality=page.locator('#renderMode'),pack=page.locator('#packRectArt');
const label=page.locator('#fieldBossLabel');
const read=()=>page.evaluate(()=>{
 const {t,fieldBoss,actors:[actor],mora,progression,returns,holdAllyFire,story}=window.lab.frame;
 return {t,fieldBoss,actor,mora,progression,returns,holdAllyFire,node:story.node};
});

async function at(move,min,max=Infinity){
 const frame=await page.waitForFunction(([move,min])=>{
  const f=window.lab.frame;
  if(f.fieldBoss?.move===move&&f.fieldBoss.tick>=min)return {boss:f.fieldBoss,actor:f.actors[0]};
 },[move,min]);
 const result=await frame.jsonValue();
 assert.ok(result.boss.tick<max,move+' passed the expected timing: '+result.boss.tick);
 return result;
}

async function pause(value){
 await page.evaluate(()=>document.activeElement.blur());
 await page.keyboard.press('KeyP');
 await page.waitForFunction(value=>window.lab.frame.paused===value,value);
}

async function capture(name,expectedLabel){
 await pause(true);
 const {t,fieldBoss:pose}=await read();
 assert.match(await label.textContent(),expectedLabel);
 const markers=await page.evaluate(()=>{
  const f=window.lab.frame;
  return f.draws.filter(d=>d.kind==='text'&&['#9df4ce','#91d6ff'].includes(d.color))
   .map(d=>[String(d.text),d.x+f.camera,d.y]);
 });
 await canvas.screenshot({path:path.join(out,name+'-png.png')});
 const profiles={};
 for(const profile of ['h48c32','h32c16']){
  const raw=await captureRectTransfer(page,profile,false,async()=>{
   await quality.selectOption(profile);
   await pack.uncheck();
  });
  const packed=await captureRectTransfer(page,profile,true,()=>pack.check());
  assert.equal(packed.raster,raw.raster,name+' '+profile+' packed pixels differ');
  assert.equal(raw.snapshot.t,t);
  assert.equal(packed.snapshot.t,t);
  assert.ok(packed.snapshot.fieldBoss.drawCount<raw.snapshot.fieldBoss.drawCount);
  assert.ok(packed.gzipBytes<raw.gzipBytes);
  profiles[profile]={legacyDraws:raw.snapshot.fieldBoss.drawCount,packedDraws:packed.snapshot.fieldBoss.drawCount,
   legacyGzip:raw.gzipBytes,packedGzip:packed.gzipBytes,identicalPixels:true};
  await canvas.screenshot({path:path.join(out,name+'-'+profile+'.png')});
 }
 await quality.selectOption('sprite');
 await pause(false);
 return {label:pose.label,tick:pose.tick,y:pose.y,recoveryTicks:pose.recoveryTicks,markers,profiles};
}

async function importSave(view,file){
 await view.goto(url);
 await view.waitForFunction(()=>window.lab?.frame);
 await view.locator('#importSave').setInputFiles(file);
 await view.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('ファイルの進行で町から再開'));
}

try{
 await importSave(page,source);
 if(await drive.node()!=='liyue-harbor')await drive.warp('liyue-harbor');
 for(const node of ['liyue-entry',hub])await drive.cross(node);
 if(!(await read()).holdAllyFire)await page.locator('#allyFire').click();
 await page.waitForFunction(()=>window.lab.frame.holdAllyFire);
 await drive.accept(quest);
 await drive.cross(approach);
 await drive.cross(arena);
 await drive.walk(748);
 const before=await read();
 assert.equal(before.fieldBoss.maxhp,738);
 assert.equal(before.progression.level,200);
 await at('FSU01',48,108);
 await at('FSU02',48,144);
 console.log('Walked from Liyue into Chenyu Vale; claw and water-blade moves observed.');

 const fixed=await at('FSU03',60,74);
 const {x:origin,destinationX:destination}=fixed.boss;
 const side=Math.sign(destination-origin);
 assert.ok(Number.isFinite(destination)&&side!==0);
 const warning=await capture('warning',/① 風の輪から離れる → ② 水の着地点/);
 assert.deepEqual(warning.markers.map(([n])=>n),['1','2']);
 assert.deepEqual(warning.markers.map(([,,y])=>y),[501,522]);
 assert.ok(Math.abs(warning.markers[0][1]-origin)<.001);
 assert.ok(Math.abs(warning.markers[1][1]-destination)<.001);
 await drive.walk(origin+side*126);
 const wind=await at('FSU03',111,120);
 assert.ok(Math.abs(wind.actor.x-origin)>88);
 assert.equal(wind.actor.hp,fixed.actor.hp);
 assert.equal(wind.boss.destinationX,destination);
 await at('FSU03',122,143);
 await drive.walk(destination-side*96);
 const jump=await at('FSU03',171,184);
 assert.ok(jump.boss.flying&&jump.boss.y<420);
 assert.ok((destination-jump.actor.x)*side>61.6);
 const airborne=await capture('airborne',/② 水の着地点と波から離れる/);
 const landing=await at('FSU03',193,204);
 assert.deepEqual([landing.boss.x,landing.boss.y,landing.boss.destinationX],[destination,480,destination]);
 assert.equal(landing.actor.hp,fixed.actor.hp);
 const wave=await at('FSU03',211,225);
 assert.equal(wave.actor.hp,fixed.actor.hp);
 assert.match(await label.textContent(),/水波・着地点の前方から離れる/);
 const opening=await at('FSU03',228,250);
 assert.equal(opening.boss.tick+opening.boss.recoveryTicks,372);
 assert.equal(opening.actor.hp,fixed.actor.hp);
 assert.equal(opening.boss.form,'resting');
 const recovery=await capture('recovery',/頭が下がる・反撃.*反撃できる時間/);
 console.log('Dodged wind, landing and wave; fixed warning matched the real landing.');

 await drive.walk(destination-side*64);
 const edge=await read();
 assert.equal(edge.fieldBoss.form,'resting');
 assert.ok(Math.abs(edge.actor.x-destination)<113&&(destination-edge.actor.x)*edge.actor.dir>0);
 await page.keyboard.down('KeyJ');
 try{
  await page.waitForFunction(()=>window.lab.frame.fieldBoss?.phase==='respawn',null,{timeout:3500});
 }finally{await page.keyboard.up('KeyJ')}
 const defeated=await read();
 assert.equal(defeated.returns,0);
 const reward={xp:defeated.progression.killXp-before.progression.killXp,mora:defeated.mora-before.mora};
 assert.ok(reward.xp>0);
 assert.equal(reward.mora,196);
 await drive.count(quest,1);
 await drive.cross(approach);
 await drive.cross(hub);
 const preReport=await read();
 await drive.report(quest);
 const postReport=await read();
 assert.deepEqual([postReport.progression.questXp-preReport.progression.questXp,postReport.mora-preReport.mora],[2900,240]);
 await page.locator('#saveProgress').click();
 await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('保存しました'));
 const checkpoint=path.join(out,'complete.json');
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('maple-lua-lab.checkpoint.v1')));
 await fs.writeFile(checkpoint,JSON.stringify(saved,null,2)+'\n');
 const fresh=await browser.newPage();
 fresh.on('pageerror',error=>errors.push(error.message));
 await importSave(fresh,checkpoint);
 const restored=await fresh.evaluate(()=>JSON.parse(localStorage.getItem('maple-lua-lab.checkpoint.v1')));
 assert.equal(restored.endgame.bosses[boss].clears,1);
 assert.deepEqual(restored.endgame.bosses['boss-20040501'],input.endgame.bosses['boss-20040501']);
 assert.deepEqual(restored.endgame.weekly,input.endgame.weekly);
 assert.equal(restored.story.quests[quest].status,'complete');
 const reported=Object.values(restored.story.quests).filter(q=>q.status==='complete').length;
 assert.equal(reported,Object.values(input.story.quests).filter(q=>q.status==='complete').length+1);
 assert.deepEqual(errors,[]);
 const result={inputSha256:createHash('sha256').update(bytes).digest('hex'),level:defeated.progression.level,
  journeys:drive.journeys,fall:{origin,locked:destination,landed:landing.boss.x,airborneY:jump.boss.y,
   heroDuringWind:wind.actor.x,heroAtLanding:landing.actor.x,windDamage:fixed.actor.hp-wind.actor.hp,
   landingAndWaveDamage:wind.actor.hp-opening.actor.hp},captures:{warning,airborne,recovery},
  reward,fieldClears:restored.endgame.bosses[boss].clears,commission:restored.story.quests[quest].status,
  reported,priorWeeklyRecordsPreserved:true,returns:defeated.returns,errors};
 await fs.writeFile(path.join(out,'browser.json'),JSON.stringify(result,null,2)+'\n');
 console.log('Verified earned Suanni clear, quest report '+reported+', and six pixel-identical transfers.');
}catch(error){
 const state=await read();
 console.error({node:state?.node,boss:state?.fieldBoss,x:state?.actor.x,hp:state?.actor.hp,errors});
 throw error;
}finally{await browser.close()}
