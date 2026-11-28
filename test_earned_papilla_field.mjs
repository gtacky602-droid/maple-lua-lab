import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import {captureRectTransfer} from './tools/browser_rect_transfer.mjs';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const source=process.env.PAPILLA_EARNED_SAVE||'work/earned-config-device/complete.json';
const out=process.env.PAPILLA_OUTPUT||'work/earned-papilla';
const url=process.env.LAB_URL||'http://127.0.0.1:51362/';
const rawSave=await fs.readFile(source),input=JSON.parse(rawSave);
const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const [hub,quarry,road,arena]=['natlan-hub','natlan-quarry-road','natlan-field','papilla-field-hollow'];
const boss='boss-22120101',quest='papilla-commission';
const equipped=save=>save.inventory.items.filter(item=>item.owner>0).sort((a,b)=>a.id-b.id);
const feather=equipped(input).find(item=>item.owner===1&&item.slot===2);
const originalWeapon=input.weapons.equipped.traveler;
assert.ok(originalWeapon&&feather&&!input.endgame.bosses[boss]&&!input.story.quests[quest]);
await fs.mkdir(out,{recursive:true});

const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1200,height:940}});
page.setDefaultTimeout(24000);
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
const drive=waypointDriver(page,Object.fromEntries(graph.nodes.map(node=>[node.id,node])));
const canvas=page.locator('#game'),quality=page.locator('#renderMode'),pack=page.locator('#packRectArt');
const read=()=>page.evaluate(()=>{
 const {t,fieldBoss,actors:[actor],mora,progression,returns,holdAllyFire,story}=window.lab.frame;
 return {t,fieldBoss,actor,mora,progression,returns,holdAllyFire,node:story.node};
});

async function at(move,min,max=Infinity){
 const frame=await page.waitForFunction(([move,min])=>{
  const {fieldBoss:b,actors:[actor]}=window.lab.frame;
  if(b?.move===move&&b.tick>=min)return {boss:b,actor};
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

async function saveProgress(){
 await page.locator('#saveProgress').click();
 await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('保存しました'));
 return page.evaluate(()=>JSON.parse(localStorage.getItem('maple-lua-lab.checkpoint.v1')));
}

async function capture(name,expectedLabel,{marker,saveBattle=false}={}){
 await pause(true);
 const {t,fieldBoss:pose}=await read();
 assert.match(await page.locator('#fieldBossLabel').textContent(),expectedLabel);
 const badges=await page.evaluate(()=>{
  const f=window.lab.frame;
  return f.draws.filter(d=>d.kind==='text'&&d.color==='#f4deff').map(d=>[d.text,d.x+f.camera,d.y]);
 });
 if(marker){
  assert.equal(badges.length,1);
  assert.equal(badges[0][0],marker);
  assert.equal(badges[0][2],501);
  if(marker==='着地')assert.ok(Math.abs(badges[0][1]-pose.destinationX)<.001);
 }else assert.deepEqual(badges,[]);
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
 if(saveBattle){
  const partial=await saveProgress();
  assert.equal(partial.story.node,arena);
  assert.equal(partial.fieldBosses[boss].hp,pose.hp);
  assert.ok(partial.fieldBosses[boss].elapsedTicks>0);
  await fs.writeFile(path.join(out,'mid-fight.json'),JSON.stringify(partial,null,2)+'\n');
 }
 await pause(false);
 return {t:pose.tick,hp:pose.hp,form:pose.form,label:pose.label,badges,profiles};
}

async function importSave(view,file){
 await view.goto(url);
 await view.waitForFunction(()=>window.lab?.frame);
 await view.locator('#importSave').setInputFiles(file);
 await view.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('ファイルの進行で町から再開'));
}

async function changeGear(actions,weapon){
 await page.evaluate(actions=>actions.forEach(action=>window.lab.action(action)),actions);
 await page.waitForFunction(id=>window.lab.frame.weaponView?.traveler===id,weapon);
 return (await read()).actor.atk;
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
 const originalAttack=(await read()).actor.atk;
 const trialAttack=await changeGear(['artifact_remove:'+feather.id,'weapon_equip:traveler:SW04'],'SW04');
 assert.ok(trialAttack>0&&trialAttack<originalAttack/4);
 if(!(await read()).holdAllyFire)await page.locator('#allyFire').click();
 await page.waitForFunction(()=>window.lab.frame.holdAllyFire);
 await drive.accept(quest);
 for(const node of [quarry,road,arena])await drive.cross(node);
 await drive.walk(742);
 const before=await read();
 assert.equal(before.fieldBoss.maxhp,1050);
 assert.equal(before.progression.level,200);

 const stemStart=await at('FMP01',60,82);
 const side=Math.sign(stemStart.actor.x-stemStart.boss.x);
 assert.ok(side);
 await drive.walk(stemStart.boss.x+side*82);
 await face(stemStart.boss.x);
 const swing=await at('FMP01',64,102);
 await page.locator('.skills button[data-action="normal"]').click();
 await at('FMP01',swing.boss.tick+12,117);
 const hurt=await read();
 assert.ok(hurt.fieldBoss.hp>0&&hurt.fieldBoss.hp<before.fieldBoss.hp);
 const retainedHp=hurt.fieldBoss.hp;
 const stem=await capture('stem',/樹影・正面の帯から離れる/);
 await drive.walk(stemStart.boss.x+side*176);
 const stemHit=await at('FMP01',137,144);
 assert.equal(stemHit.actor.hp,stemStart.actor.hp);
 await at('FMP01',151,190);
 await drive.walk(stemStart.boss.x+side*123);

 const wingStart=await at('FMP02',60,83);
 assert.equal(wingStart.boss.hp,retainedHp);
 await drive.walk(wingStart.boss.x+side*176);
 const firstWing=await at('FMP02',127,134);
 assert.equal(firstWing.actor.hp,wingStart.actor.hp);
 const wing=await capture('wing',/機竜影 1\/2・予告の帯から離れる/,{marker:'1/2'});
 const secondWing=await at('FMP02',189,198);
 assert.match(secondWing.boss.label,/機竜影 2\/2/);
 assert.equal((await at('FMP02',200,216)).actor.hp,wingStart.actor.hp);
 await drive.walk(wingStart.boss.x+side*109);

 const fungusStart=await at('FMP03',60,78);
 assert.equal(fungusStart.boss.hp,retainedHp);
 const landing=fungusStart.boss.destinationX;
 const safeSide=Math.sign(fungusStart.boss.x-landing)||-side;
 await drive.walk(landing+safeSide*96);
 const flight=await at('FMP03',111,124);
 assert.ok(flight.boss.flying&&flight.boss.y<422&&Math.abs(flight.actor.x-landing)>61.6);
 const fungus=await capture('fungus',/菌獣影・着地点から離れる/,{marker:'着地',saveBattle:true});
 const impact=await at('FMP03',135,144);
 assert.deepEqual([impact.boss.x,impact.boss.y,impact.boss.hp],[landing,480,retainedHp]);
 assert.equal(impact.actor.hp,fungusStart.actor.hp);
 const recovery=await at('FMP03',180,206);
 assert.equal(recovery.boss.tick+recovery.boss.recoveryTicks,324);
 console.log('All three forms kept the reduced HP; the fixed fungus landing was dodged.');

 await drive.cross(road);
 await drive.cross(arena);
 await drive.walk(470);
 const revisited=(await read()).fieldBoss;
 assert.deepEqual([revisited.form,revisited.hp],['root',retainedHp]);
 await page.locator('#loadProgress').click();
 await drive.waitNode(hub);
 const restoredAttack=await changeGear(['artifact_equip:'+feather.id,'weapon_equip:traveler:'+originalWeapon],originalWeapon);
 assert.equal(restoredAttack,originalAttack);
 if(!(await read()).holdAllyFire)await page.locator('#allyFire').click();
 await page.waitForFunction(()=>window.lab.frame.holdAllyFire);
 for(const node of [quarry,road,arena])await drive.cross(node);
 await drive.walk(470);
 const reloaded=await read();
 assert.deepEqual([reloaded.fieldBoss.form,reloaded.fieldBoss.hp],['root',retainedHp]);
 console.log('Leaving and loading the airborne save both restored the root pose and the same reduced HP.');

 await drive.walk(742);
 const opening=await at('FMP01',156,182);
 const returnSide=Math.sign(opening.actor.x-opening.boss.x)||-1;
 await drive.walk(opening.boss.x+returnSide*63);
 await face(opening.boss.x);
 const ready=await read();
 assert.ok(ready.fieldBoss.recoveryTicks>0&&ready.fieldBoss.hp===retainedHp);
 await page.keyboard.down('KeyJ');
 try{await page.waitForFunction(()=>window.lab.frame.fieldBoss?.phase==='respawn',null,{timeout:1900})}
 finally{await page.keyboard.up('KeyJ')}
 const defeated=await read();
 assert.ok(defeated.t-ready.t<=ready.fieldBoss.recoveryTicks/60+.05);
 assert.equal(defeated.returns,0);
 const reward={xp:defeated.progression.killXp-reloaded.progression.killXp,mora:defeated.mora-reloaded.mora};
 assert.ok(reward.xp>0);
 assert.equal(reward.mora,395);
 await drive.count(quest,1);
 for(const node of [road,quarry,hub])await drive.cross(node);
 const pre=await read();
 await drive.report(quest);
 const post=await read();
 assert.deepEqual([post.progression.questXp-pre.progression.questXp,post.mora-pre.mora],[7800,500]);
 const saved=await saveProgress();
 assert.deepEqual(saved.weapons,input.weapons);
 assert.deepEqual(equipped(saved),equipped(input));
 const checkpoint=path.join(out,'complete.json');
 await fs.writeFile(checkpoint,JSON.stringify(saved,null,2)+'\n');
 const fresh=await browser.newPage();
 fresh.on('pageerror',error=>errors.push(error.message));
 await importSave(fresh,checkpoint);
 const restored=await fresh.evaluate(()=>JSON.parse(localStorage.getItem('maple-lua-lab.checkpoint.v1')));
 assert.equal(restored.endgame.bosses[boss].clears,1);
 assert.deepEqual(restored.endgame.bosses['boss-24090201'],input.endgame.bosses['boss-24090201']);
 assert.deepEqual(restored.endgame.weekly,input.endgame.weekly);
 assert.equal(restored.story.quests[quest].status,'complete');
 const reported=Object.values(restored.story.quests).filter(q=>q.status==='complete').length;
 assert.equal(reported,Object.values(input.story.quests).filter(q=>q.status==='complete').length+1);
 assert.deepEqual(errors,[]);
 const result={inputSha256:createHash('sha256').update(rawSave).digest('hex'),level:defeated.progression.level,
  journeys:drive.journeys,gear:{trialAttack,restoredAttack},hp:{initial:before.fieldBoss.hp,
   stem:stem.hp,wing:wing.hp,fungus:fungus.hp,revisited:revisited.hp,reloaded:reloaded.fieldBoss.hp},
  revisitAndReloadForm:'root',fungus:{locked:landing,actual:impact.boss.x,airborneY:flight.boss.y,
   playerDamage:fungusStart.actor.hp-impact.actor.hp,recoveryTicks:recovery.boss.recoveryTicks},
  captures:{stem,wing,fungus},reward,fieldClears:restored.endgame.bosses[boss].clears,
  reported,priorWeeklyRecordsPreserved:true,returns:defeated.returns,errors};
 await fs.writeFile(path.join(out,'browser.json'),JSON.stringify(result,null,2)+'\n');
 console.log('Verified earned Papilla clear, quest report '+reported+', and six pixel-identical transfers.');
}catch(error){
 const state=await read();
 console.error({node:state?.node,boss:state?.fieldBoss,x:state?.actor.x,hp:state?.actor.hp,atk:state?.actor.atk,errors});
 throw error;
}finally{await browser.close()}
