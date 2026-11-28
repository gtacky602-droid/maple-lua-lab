import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import {captureRectTransfer} from './tools/browser_rect_transfer.mjs';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const source=process.env.CONFIG_EARNED_SAVE||'work/earned-yumka/complete.json';
const out=process.env.CONFIG_OUTPUT||'work/earned-config-device';
const url=process.env.LAB_URL||'http://127.0.0.1:51361/';
const rawSave=await fs.readFile(source),input=JSON.parse(rawSave);
const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const [hub,quarry,road,arena]=['natlan-hub','natlan-quarry-road','natlan-field','config-device-field-workshop'];
const boss='boss-24090201',quest='config-device-commission';
assert.ok(!input.endgame.bosses[boss]&&!input.story.quests[quest]);
await fs.mkdir(out,{recursive:true});

const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1200,height:940}});
page.setDefaultTimeout(24000);
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
const drive=waypointDriver(page,Object.fromEntries(graph.nodes.map(node=>[node.id,node])));
const canvas=page.locator('#game'),quality=page.locator('#renderMode'),pack=page.locator('#packRectArt');
const normal=page.locator('.skills button[data-action="normal"]');
const read=()=>page.evaluate(()=>{
 const {t,fieldBoss,actors:[actor],mora,progression,kills,returns,holdAllyFire,story}=window.lab.frame;
 return {t,fieldBoss,actor,mora,progression,kills,returns,holdAllyFire,node:story.node};
});

async function at(move,min,max=Infinity){
 const frame=await page.waitForFunction(([move,min])=>{
  const f=window.lab.frame,b=f.fieldBoss;
  if(b?.move===move&&b.tick>=min)return {boss:b,actor:f.actors[0],
   column:f.draws.some(d=>d.kind==='rect'&&d.color==='#ffb44d77')};
 },[move,min]);
 const result=await frame.jsonValue();
 assert.ok(result.boss.tick<max,move+' passed expected timing: '+result.boss.tick);
 return result;
}

async function pause(value){
 await page.evaluate(()=>document.activeElement.blur());
 await page.keyboard.press('KeyP');
 await page.waitForFunction(value=>window.lab.frame.paused===value,value);
}

async function capture(name,expectedLabel,markerX){
 await pause(true);
 const {t,fieldBoss:phase}=await read();
 assert.match(await page.locator('#fieldBossLabel').textContent(),expectedLabel);
 const marker=await page.evaluate(()=>{
  const f=window.lab.frame,m=f.draws.find(d=>d.kind==='text'&&d.text==='着弾');
  return m?[m.x+f.camera,m.y]:null;
 });
 if(markerX===undefined)assert.equal(marker,null);
 else assert.ok(marker?.[1]===501&&Math.abs(marker[0]-markerX)<.001);
 await canvas.screenshot({path:path.join(out,name+'-png.png')});
 const profiles={};
 for(const profile of ['h48c32','h32c16']){
  const raw=await captureRectTransfer(page,profile,false,async()=>{
   await quality.selectOption(profile);
   await pack.uncheck();
  });
  const packed=await captureRectTransfer(page,profile,true,()=>pack.check());
  assert.equal(packed.raster,raw.raster,name+' '+profile+' changed packed pixels');
  assert.equal(raw.snapshot.t,t);
  assert.equal(packed.snapshot.t,t);
  assert.ok(packed.snapshot.fieldBoss.drawCount<raw.snapshot.fieldBoss.drawCount&&packed.gzipBytes<raw.gzipBytes);
  profiles[profile]={legacyDraws:raw.snapshot.fieldBoss.drawCount,packedDraws:packed.snapshot.fieldBoss.drawCount,
   legacyGzip:raw.gzipBytes,packedGzip:packed.gzipBytes,identicalPixels:true};
  await canvas.screenshot({path:path.join(out,name+'-'+profile+'.png')});
 }
 await quality.selectOption('sprite');
 await pause(false);
 return {label:phase.label,tick:phase.tick,marker,recoveryTicks:phase.recoveryTicks,profiles};
}

async function importSave(view,file){
 await view.goto(url);
 await view.waitForFunction(()=>window.lab?.frame);
 await view.locator('#importSave').setInputFiles(file);
 await view.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('ファイルの進行で町から再開'));
}

async function face(x){
 const {actor}=await read(),dir=Math.sign(x-actor.x);
 if(!dir||dir===actor.dir)return;
 const key=dir>0?'KeyD':'KeyA';
 await page.keyboard.down(key);
 try{await page.waitForFunction(dir=>window.lab.frame.actors[0].dir===dir,dir)}
 finally{await page.keyboard.up(key)}
}

try{
 await importSave(page,source);
 if(await drive.node()!==hub)await drive.warp(hub);
 if(!(await read()).holdAllyFire)await page.locator('#allyFire').click();
 await page.waitForFunction(()=>window.lab.frame.holdAllyFire);
 await drive.accept(quest);
 for(const node of [quarry,road,arena])await drive.cross(node);
 await drive.walk(738);
 const before=await read();
 assert.equal(before.fieldBoss.maxhp,1020);
 assert.equal(before.progression.level,200);
 await at('FSC01',48,102);
 await at('FSC02',54,108);
 const aimed=await at('FSC03',60,85);
 const {left,right}=aimed.boss.cannonBounds,center=(left+right)/2;
 const safe=aimed.boss.x>center?right+42:left-42;
 await drive.walk(safe);
 const closed=await at('FSC03',302,324);
 assert.ok(!closed.boss.summon&&!closed.boss.cannonInterrupted);
 assert.deepEqual(closed.boss.cannonBounds,{left,right});
 assert.match(closed.boss.label,/集積器を攻撃できない/);
 const fired=await at('FSC03',326,338);
 assert.ok(fired.column&&(!fired.boss.cannonInterrupted));
 assert.ok(fired.actor.x<left||fired.actor.x>right);
 assert.equal(fired.actor.hp,aimed.actor.hp);
 const blast=await capture('blast',/球雷砲・着弾範囲から離れる/,center);
 const natural=await at('FSC03',360,390);
 assert.equal(natural.boss.tick+natural.boss.recoveryTicks,504);
 console.log('The unbroken collector expired. The cannon fired at the pinned column, with no damage outside it.');

 await at('FSC01',48,102);
 await at('FSC02',54,108);
 const ready=await at('FSC03',62,82);
 const target=ready.boss.summon.x,side=Math.sign(target-ready.boss.x);
 const secondBounds=ready.boss.cannonBounds, secondCenter=(secondBounds.left+secondBounds.right)/2;
 assert.ok(side&&ready.boss.summon.hp===3);
 await drive.walk(target-side*38);
 await face(target);
 const positioned=await read();
 assert.ok((target-positioned.actor.x)*side>10&&(positioned.actor.x-ready.boss.x)*side>10);
 const counts=[positioned.fieldBoss.summon.hp];
 for(const hp of [2,1]){
  await normal.click();
  await page.waitForFunction(hp=>window.lab.frame.fieldBoss?.summon?.hp===hp,hp,{timeout:1900});
  const struck=await read();
  await at('FSC03',struck.fieldBoss.tick+39,250);
  assert.equal((await read()).fieldBoss.summon.hp,hp);
  counts.push(hp);
 }
 const collector=await capture('collector',/集積器に別々の攻撃をあと1回・受付あと/,secondCenter);
 await at('FSC03',251,277);
 const beforeBreak=await read();
 await normal.click();
 await page.waitForFunction(()=>window.lab.frame.fieldBoss?.cannonInterrupted,null,{timeout:1100});
 const broken=await read();
 counts.push(0);
 assert.deepEqual([broken.kills,broken.mora,broken.progression.killXp],
  [beforeBreak.kills,beforeBreak.mora,beforeBreak.progression.killXp]);
 assert.equal(broken.fieldBoss.hp,before.fieldBoss.hp);
 assert.equal(broken.fieldBoss.form,'down');
 assert.ok(!broken.fieldBoss.summon&&!broken.fieldBoss.cannonBounds);
 const breakTick=broken.fieldBoss.tick+broken.fieldBoss.recoveryTicks-180;
 assert.ok(breakTick>=251&&breakTick<300);
 await drive.walk(secondCenter);
 const interrupted=await at('FSC03',326,337);
 assert.equal(interrupted.boss.form,'down');
 assert.ok(interrupted.actor.x>secondBounds.left&&interrupted.actor.x<secondBounds.right);
 assert.ok(interrupted.boss.cannonInterrupted&&!interrupted.column&&!interrupted.boss.cannonBounds);
 assert.equal(interrupted.actor.hp,beforeBreak.actor.hp);
 const down=await capture('down',/球雷砲を中断・反撃の好機.*反撃できる時間/);
 console.log('Three separate normal attacks broke the collector. The interrupted shot did no damage inside the column.');

 await drive.walk(ready.boss.x+side*63);
 await face(ready.boss.x);
 const opening=await read();
 assert.ok(opening.fieldBoss.recoveryTicks>0&&opening.fieldBoss.form==='down');
 await page.keyboard.down('KeyJ');
 try{await page.waitForFunction(()=>window.lab.frame.fieldBoss?.phase==='respawn',null,{timeout:1500})}
 finally{await page.keyboard.up('KeyJ')}
 const defeated=await read();
 assert.ok(defeated.t-opening.t<=opening.fieldBoss.recoveryTicks/60+.05);
 assert.equal(defeated.returns,0);
 const reward={xp:defeated.progression.killXp-before.progression.killXp,mora:defeated.mora-before.mora};
 assert.ok(reward.xp>0);
 assert.equal(reward.mora,380);
 await drive.count(quest,1);
 for(const node of [road,quarry,hub])await drive.cross(node);
 const pre=await read();
 await drive.report(quest);
 const post=await read();
 assert.deepEqual([post.progression.questXp-pre.progression.questXp,post.mora-pre.mora],[7600,480]);
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
 assert.deepEqual(restored.endgame.bosses['boss-26220301'],input.endgame.bosses['boss-26220301']);
 assert.deepEqual(restored.endgame.weekly,input.endgame.weekly);
 assert.equal(restored.story.quests[quest].status,'complete');
 const reported=Object.values(restored.story.quests).filter(q=>q.status==='complete').length;
 assert.equal(reported,Object.values(input.story.quests).filter(q=>q.status==='complete').length+1);
 assert.deepEqual(errors,[]);
 const result={inputSha256:createHash('sha256').update(rawSave).digest('hex'),level:defeated.progression.level,
  journeys:drive.journeys,natural:{bounds:{left,right},firedAt:fired.boss.tick,playerX:fired.actor.x,
   playerDamage:aimed.actor.hp-fired.actor.hp,recoveryTicks:natural.boss.recoveryTicks},
  interrupted:{counts,breakTick,downTicks:180,wouldFireAt:interrupted.boss.tick,playerX:interrupted.actor.x,
   bounds:secondBounds,playerDamage:beforeBreak.actor.hp-interrupted.actor.hp,collectorRewards:0},
  captures:{collector,blast,down},reward,fieldClears:restored.endgame.bosses[boss].clears,
  reported,priorWeeklyRecordsPreserved:true,returns:defeated.returns,errors};
 await fs.writeFile(path.join(out,'browser.json'),JSON.stringify(result,null,2)+'\n');
 console.log('Verified earned Configuration Device clear, quest report '+reported+', and six pixel-identical transfers.');
}catch(error){
 const state=await read();
 console.error({node:state?.node,boss:state?.fieldBoss,x:state?.actor.x,hp:state?.actor.hp,errors});
 throw error;
}finally{await browser.close()}
