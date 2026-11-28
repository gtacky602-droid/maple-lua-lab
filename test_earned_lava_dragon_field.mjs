import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import {captureRectTransfer} from './tools/browser_rect_transfer.mjs';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const source=process.env.LAVA_EARNED_SAVE||'work/earned-papilla/final/complete.json';
const out=process.env.LAVA_OUTPUT||'work/earned-lava-dragon';
const url=process.env.LAB_URL||'http://127.0.0.1:51363/';
const bytes=await fs.readFile(source),input=JSON.parse(bytes);
const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const [hub,quarry,road,arena]=['natlan-hub','natlan-quarry-road','natlan-field','atocpan-lava-field'];
const boss='boss-26270301',quest='lava-dragon-commission';
const equipment=save=>save.inventory.items.filter(item=>item.owner>0).sort((a,b)=>a.id-b.id);
const feather=equipment(input).find(item=>item.owner===1&&item.slot===2);
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
 const handle=await page.waitForFunction(([move,min])=>{
  const {fieldBoss:b,actors:[actor]}=window.lab.frame;
  if(b?.move===move&&b.tick>=min)return {boss:b,actor};
 },[move,min]);
 const found=await handle.jsonValue();
 assert.ok(found.boss.tick<max,move+' passed expected timing: '+found.boss.tick);
 return found;
}

async function pause(value){
 await page.evaluate(()=>document.activeElement.blur());
 await page.keyboard.press('KeyP');
 await page.waitForFunction(value=>window.lab.frame.paused===value,value);
}

async function capture(name,expectedLabel,points=[]){
 await pause(true);
 const {t,fieldBoss:phase}=await read();
 assert.match(await page.locator('#fieldBossLabel').textContent(),expectedLabel);
 const marks=await page.evaluate(()=>{
  const f=window.lab.frame;
  return f.draws.filter(d=>d.kind==='text'&&d.color==='#fff1be').map(d=>[d.text,d.x+f.camera,d.y]);
 });
 assert.equal(marks.length,points.length);
 assert.ok(marks.every(([text,x,y],i)=>text===String(i+1)&&Math.abs(x-points[i])<.001&&y===501));
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
 return {label:phase.label,tick:phase.tick,hp:phase.hp,heat:phase.lavaHeat.level,marks,profiles};
}

async function importSave(view,file){
 await view.goto(url);
 await view.waitForFunction(()=>window.lab?.frame);
 await view.locator('#importSave').setInputFiles(file);
 await view.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('ファイルの進行で町から再開'));
}

async function saveProgress(){
 await page.locator('#saveProgress').click();
 await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('保存しました'));
 return page.evaluate(()=>JSON.parse(localStorage.getItem('maple-lua-lab.checkpoint.v1')));
}

async function changeGear(actions,weapon){
 await page.evaluate(actions=>actions.forEach(action=>window.lab.action(action)),actions);
 await page.waitForFunction(id=>window.lab.frame.weaponView?.traveler===id,weapon);
 return (await read()).actor.atk;
}

async function slots(first,second){
 const slot1=page.getByLabel('枠1の1番目',{exact:true});
 if(!await slot1.isVisible())await page.getByText('スキル装着・全100技の制作状況',{exact:true}).click();
 await slot1.selectOption(first);
 await page.getByLabel('枠2の1番目',{exact:true}).selectOption(second);
 await page.locator('#applySlots').click();
 await page.waitForFunction(([a,b])=>window.lab.frame.loadout[0][0]===a&&window.lab.frame.loadout[1][0]===b,[first,second]);
}

async function face(x){
 const {actor}=await read(),dir=Math.sign(x-actor.x);
 if(!dir||dir===actor.dir)return;
 const key=dir>0?'KeyD':'KeyA';
 await page.keyboard.down(key);
 try{await page.waitForFunction(dir=>window.lab.frame.actors[0].dir===dir,dir)}
 finally{await page.keyboard.up(key)}
}

async function fire(heat,form){
 await page.waitForFunction(()=>!window.lab.frame.actors[0].cd.SK21&&!window.lab.frame.macro);
 const aim=await read();
 if(Math.abs(aim.actor.x-aim.fieldBoss.x)>164){
  await drive.walk(aim.fieldBoss.x+Math.sign(aim.actor.x-aim.fieldBoss.x)*114);
 }
 await face((await read()).fieldBoss.x);
 const before=await read();
 await page.keyboard.press('Digit1');
 await page.waitForFunction(([level,form])=>{
  const b=window.lab.frame.fieldBoss;
  return b?.lavaHeat?.level===level&&b.form===form;
 },[heat,form],{timeout:2200});
 const changed=await read();
 await page.waitForFunction(start=>window.lab.frame.t>=start+.4,before.t);
 const settled=await read();
 assert.equal(settled.fieldBoss.lavaHeat.level,heat);
 assert.ok(settled.fieldBoss.hp<before.fieldBoss.hp);
 return {heat,form,hp:settled.fieldBoss.hp,beforeTick:before.fieldBoss.tick,changedTime:changed.t};
}

try{
 await importSave(page,source);
 if(await drive.node()!==hub)await drive.warp(hub);
 const originalAttack=(await read()).actor.atk;
 const trialAttack=await changeGear(['artifact_remove:'+feather.id,'weapon_equip:traveler:SW04'],'SW04');
 assert.ok(trialAttack>0&&trialAttack<originalAttack/4);
 await slots('SK21','SK17');
 if(!(await read()).holdAllyFire)await page.locator('#allyFire').click();
 await page.waitForFunction(()=>window.lab.frame.holdAllyFire);
 await drive.accept(quest);
 for(const node of [quarry,road,arena])await drive.cross(node);
 await drive.walk(774);
 const before=await read();
 assert.equal(before.fieldBoss.maxhp,1100);
 assert.equal(before.progression.level,200);
 await at('FLD01',59,94);
 const rock=await capture('rock',/アースゴーレム・熱 0\/4.*岩腕/);
 await at('FLD01',150,246);
 const heat1=await fire(1,'rock');
 const heat2=await fire(2,'molten');
 await at('FLD03',150,182);
 const heat3=await fire(3,'molten');

 const start=await at('FLD04',60,79);
 const points=start.boss.eruptionPoints;
 assert.equal(points.length,2);
 const gap=points.reduce((sum,x)=>sum+x,0)/2;
 await drive.walk(gap);
 const eruption=await at('FLD04',129,140);
 assert.ok(points.every(x=>Math.abs(x-eruption.actor.x)>37.84));
 assert.deepEqual(eruption.boss.eruptionPoints,points);
 assert.equal(eruption.actor.hp,start.actor.hp);
 const molten=await capture('molten',/熔焰の龍・熱 3\/4.*噴出 1\/2/,points);
 await at('FLD04',151,172);
 const heat4=await fire(4,'overburn');
 assert.ok(heat4.beforeTick<192);
 const disabled=await read();
 assert.ok(disabled.fieldBoss.recoveryTicks>0&&!disabled.fieldBoss.move&&!disabled.fieldBoss.eruptionPoints);
 const overburn=await capture('overburn',/過燃焼・熱 4\/4.*反撃できる時間/);
 await page.waitForFunction(until=>window.lab.frame.t>=until,heat4.changedTime+(196-heat4.beforeTick)/60);
 const afterSecond=await read();
 assert.equal(afterSecond.fieldBoss.form,'overburn');
 assert.equal(afterSecond.actor.hp,start.actor.hp);
 console.log('Four separate fire casts raised heat once each; overburn cancelled the second eruption.');

 await drive.walk(afterSecond.fieldBoss.x+Math.sign(afterSecond.actor.x-afterSecond.fieldBoss.x)*76);
 await face(afterSecond.fieldBoss.x);
 const beforeHit=await read();
 assert.ok(beforeHit.fieldBoss.recoveryTicks>0);
 await page.locator('.skills button[data-action="normal"]').click();
 await page.waitForFunction(hp=>window.lab.frame.fieldBoss?.hp<hp,beforeHit.fieldBoss.hp);
 const hit=await read();
 assert.equal(hit.fieldBoss.form,'overburn');
 await page.waitForFunction(()=>!window.lab.frame.actors[0].lock&&!window.lab.frame.macro);
 await page.keyboard.press('Digit2');
 await page.waitForFunction(()=>window.lab.frame.fieldBoss?.form==='rock'&&window.lab.frame.fieldBoss.lavaHeat.level===0,null,{timeout:1250});
 const cooled=await read();
 assert.ok(cooled.t-heat4.changedTime<2.85&&cooled.fieldBoss.hp<hit.fieldBoss.hp);
 await page.waitForFunction(start=>window.lab.frame.t>=start+.35,cooled.t);
 const settledCool=await read();
 const partial=await saveProgress();
 assert.equal(partial.fieldBosses[boss].hp,settledCool.fieldBoss.hp);
 await fs.writeFile(path.join(out,'mid-fight.json'),JSON.stringify(partial,null,2)+'\n');
 await page.locator('#loadProgress').click();
 await drive.waitNode(hub);
 const restoredAttack=await changeGear(['artifact_equip:'+feather.id,'weapon_equip:traveler:'+originalWeapon],originalWeapon);
 assert.equal(restoredAttack,originalAttack);
 await slots(input.loadout[0][0],input.loadout[1][0]);
 if(!(await read()).holdAllyFire)await page.locator('#allyFire').click();
 await page.waitForFunction(()=>window.lab.frame.holdAllyFire);
 for(const node of [quarry,road,arena])await drive.cross(node);
 await drive.walk(520);
 const reloaded=await read();
 assert.deepEqual([reloaded.fieldBoss.form,reloaded.fieldBoss.hp],['rock',settledCool.fieldBoss.hp]);
 console.log('A normal attack landed in overburn, then water cooled the boss before the timer expired.');

 await drive.walk(774);
 const opening=await at('FLD01',150,169);
 await drive.walk(opening.boss.x+Math.sign(opening.actor.x-opening.boss.x)*64);
 await face(opening.boss.x);
 const ready=await read();
 assert.ok(ready.fieldBoss.recoveryTicks>0);
 await page.keyboard.down('KeyJ');
 try{await page.waitForFunction(()=>window.lab.frame.fieldBoss?.phase==='respawn',null,{timeout:1550})}
 finally{await page.keyboard.up('KeyJ')}
 const defeated=await read();
 assert.equal(defeated.returns,0);
 const reward={xp:defeated.progression.killXp-reloaded.progression.killXp,mora:defeated.mora-reloaded.mora};
 assert.ok(reward.xp>0);
 assert.equal(reward.mora,410);
 await drive.count(quest,1);
 for(const node of [road,quarry,hub])await drive.cross(node);
 const pre=await read();
 await drive.report(quest);
 const post=await read();
 assert.deepEqual([post.progression.questXp-pre.progression.questXp,post.mora-pre.mora],[8000,520]);
 const saved=await saveProgress();
 assert.deepEqual(saved.weapons,input.weapons);
 assert.deepEqual(saved.loadout,input.loadout);
 assert.deepEqual(equipment(saved),equipment(input));
 const checkpoint=path.join(out,'complete.json');
 await fs.writeFile(checkpoint,JSON.stringify(saved,null,2)+'\n');
 const fresh=await browser.newPage();
 fresh.on('pageerror',error=>errors.push(error.message));
 await importSave(fresh,checkpoint);
 const restored=await fresh.evaluate(()=>JSON.parse(localStorage.getItem('maple-lua-lab.checkpoint.v1')));
 assert.equal(restored.endgame.bosses[boss].clears,1);
 assert.deepEqual(restored.endgame.bosses['boss-22120101'],input.endgame.bosses['boss-22120101']);
 assert.deepEqual(restored.endgame.weekly,input.endgame.weekly);
 assert.equal(restored.story.quests[quest].status,'complete');
 const reported=Object.values(restored.story.quests).filter(q=>q.status==='complete').length;
 assert.equal(reported,Object.values(input.story.quests).filter(q=>q.status==='complete').length+1);
 assert.deepEqual(errors,[]);
 const result={inputSha256:createHash('sha256').update(bytes).digest('hex'),level:defeated.progression.level,
  journeys:drive.journeys,gear:{trialAttack,restoredAttack},heat:[heat1,heat2,heat3,heat4],
  eruption:{points,playerDamage:start.actor.hp-afterSecond.actor.hp,secondCancelled:true},
  cooling:{elapsedSeconds:cooled.t-heat4.changedTime,overburnNormalDamage:beforeHit.fieldBoss.hp-hit.fieldBoss.hp,
   hpAfterCooling:settledCool.fieldBoss.hp,hpAfterReload:reloaded.fieldBoss.hp},
  captures:{rock,molten,overburn},reward,fieldClears:restored.endgame.bosses[boss].clears,
  reported,priorWeeklyRecordsPreserved:true,returns:defeated.returns,errors};
 await fs.writeFile(path.join(out,'browser.json'),JSON.stringify(result,null,2)+'\n');
 console.log('Verified earned Lava Dragon clear, quest report '+reported+', and six pixel-identical transfers.');
}catch(error){
 const state=await read();
 console.error({node:state?.node,boss:state?.fieldBoss,x:state?.actor.x,hp:state?.actor.hp,atk:state?.actor.atk,errors});
 throw error;
}finally{await browser.close()}
