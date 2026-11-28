import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import {captureRectTransfer} from './tools/browser_rect_transfer.mjs';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const source=process.env.OVERSEER_EARNED_SAVE??'work/earned-lava-dragon/complete.json';
const out=process.env.OVERSEER_OUTPUT??'work/earned-overseer';
const url=process.env.LAB_URL??'http://127.0.0.1:51364/';
const bytes=await fs.readFile(source),input=JSON.parse(bytes);
const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const [hub,quarry,road,shelf,arena]=['natlan-hub','natlan-quarry-road','natlan-field','atocpan-lava-field','atocpan-overseer-ruin'];
const boss='boss-24090501',quest='overseer-commission';
const equipment=save=>save.inventory.items.filter(item=>item.owner>0).sort((a,b)=>a.id-b.id);
const feather=equipment(input).find(item=>item.owner===1&&item.slot===2);
const weapon=input.weapons.equipped.traveler;
assert.ok(weapon&&feather&&!input.endgame.bosses[boss]&&!input.story.quests[quest]);
await fs.mkdir(out,{recursive:true});

const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1200,height:940}});
page.setDefaultTimeout(24000);
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
const drive=waypointDriver(page,Object.fromEntries(graph.nodes.map(node=>[node.id,node])));
const canvas=page.locator('#game'),quality=page.locator('#renderMode'),pack=page.locator('#packRectArt');
const read=()=>page.evaluate(()=>{
 const {fieldBoss,actors:[actor],t,story,progression,mora,returns}=window.lab.frame;
 return {boss:fieldBoss,actor,t,node:story.node,progression,mora,returns};
});
const stored=view=>view.evaluate(()=>JSON.parse(localStorage.getItem('maple-lua-lab.checkpoint.v1')));

async function importSave(view,file){
 await view.goto(url);
 await view.waitForFunction(()=>window.lab?.frame);
 await view.locator('#importSave').setInputFiles(file);
 await view.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('ファイルの進行で町から再開'));
}

async function saveProgress(){
 await page.locator('#saveProgress').click();
 await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('保存しました'));
 return stored(page);
}

async function gear(actions,weapon){
 await page.evaluate(actions=>actions.forEach(action=>window.lab.action(action)),actions);
 await page.waitForFunction(id=>window.lab.frame.weaponView?.traveler===id,weapon);
 return (await read()).actor.atk;
}

async function skill(id){
 const slot=page.getByLabel('枠1の1番目',{exact:true});
 if(!await slot.isVisible())await page.getByText('スキル装着・全100技の制作状況',{exact:true}).click();
 await slot.selectOption(id);
 await page.locator('#applySlots').click();
 await page.waitForFunction(id=>window.lab.frame.loadout[0][0]===id,id);
}

async function enter(){
 if(!await page.evaluate(()=>window.lab.frame.holdAllyFire))await page.locator('#allyFire').click();
 await page.waitForFunction(()=>window.lab.frame.holdAllyFire);
 for(const id of [quarry,road,shelf,arena])await drive.cross(id);
}

async function at(move,first,last=Infinity){
 await page.waitForFunction(([move,first])=>{
  const b=window.lab.frame.fieldBoss;
  return b?.move===move&&b.tick>=first;
 },[move,first]);
 const state=await read();
 assert.ok(state.boss.tick<last,move+' reached tick '+state.boss.tick);
 return state;
}

async function face(x){
 const {actor}=await read();
 const dir=Math.sign(x-actor.x);
 if(dir===actor.dir||!dir)return;
 const key=dir<0?'KeyA':'KeyD';
 await page.keyboard.down(key);
 try{await page.waitForFunction(dir=>window.lab.frame.actors[0].dir===dir,dir)}
 finally{await page.keyboard.up(key)}
}

async function pause(value){
 await page.evaluate(()=>document.activeElement.blur());
 await page.keyboard.press('KeyP');
 await page.waitForFunction(value=>window.lab.frame.paused===value,value);
}

async function capture(name,label,points=[]){
 await pause(true);
 const {t,boss:phase}=await read();
 assert.match(await page.locator('#fieldBossLabel').textContent(),label);
 const marks=await page.evaluate(()=>{
  const f=window.lab.frame;
  return f.draws.filter(d=>d.kind==='text'&&d.y===501).map(d=>[d.text,d.x+f.camera]);
 });
 assert.equal(marks.length,points.length);
 assert.ok(marks.every(([text,x],i)=>text===String(i+1)&&Math.abs(x-points[i])<.001));
 await canvas.screenshot({path:path.join(out,name+'-png.png')});
 const profiles={};
 for(const profile of ['h48c32','h32c16']){
  const raw=await captureRectTransfer(page,profile,false,async()=>{
   await quality.selectOption(profile);
   await pack.uncheck();
  });
  const packed=await captureRectTransfer(page,profile,true,()=>pack.check());
  assert.equal(packed.raster,raw.raster,name+' '+profile);
  assert.equal(raw.snapshot.t,t);
  assert.equal(packed.snapshot.t,t);
  assert.ok(packed.snapshot.fieldBoss.drawCount<raw.snapshot.fieldBoss.drawCount);
  assert.ok(packed.gzipBytes<raw.gzipBytes);
  profiles[profile]={plainDraws:raw.snapshot.fieldBoss.drawCount,packedDraws:packed.snapshot.fieldBoss.drawCount,
   plainGzip:raw.gzipBytes,packedGzip:packed.gzipBytes,identicalPixels:true};
  await canvas.screenshot({path:path.join(out,name+'-'+profile+'.png')});
 }
 await quality.selectOption('sprite');
 await pause(false);
 return {label:phase.label,tick:phase.tick,flow:phase.flow,marks,profiles};
}

try{
 await importSave(page,source);
 await drive.waitNode(hub);
 const originalAttack=(await read()).actor.atk;
 const trialAttack=await gear(['artifact_remove:'+feather.id,'weapon_equip:traveler:SW04'],'SW04');
 assert.ok(trialAttack>0&&trialAttack<originalAttack/4);
 await skill('SK25');
 await drive.accept(quest);
 await enter();
 await drive.walk(774);
 assert.equal((await read()).progression.level,200);
 await at('FOV02',127,144);
 const wave=await capture('wave',/滑走水刃/);
 const locked=await at('FOV03',62,90);
 const points=locked.boss.purgePoints;
 assert.equal(points.length,3);
 await drive.walk(locked.boss.x-Math.sign(points[0]-locked.boss.x)*88);
 await face(locked.boss.x);
 await at('FOV03',125,144);
 const purge=await capture('purge',/液流 1／5/,points);
 const before=await read();
 await page.keyboard.press('Digit1');
 await page.waitForFunction(()=>window.lab.frame.fieldBoss?.flow?.chilledTicks>0);
 const cooled=await read();
 assert.equal(cooled.boss.flow.level,0);
 assert.ok(cooled.boss.hp<before.boss.hp);
 const hitTick=cooled.boss.tick+cooled.boss.flow.chilledTicks-72;
 assert.ok(hitTick<160);
 await at('FOV03',162,171);
 const chilled=await capture('cooled',/冷却中・液流 0／5/,points);
 const resumed=await at('FOV03',hitTick+72,245);
 assert.equal(resumed.boss.flow.chilledTicks,0);
 const second=await at('FOV03',254,267);
 const third=await at('FOV03',342,358);
 for(const strike of [second,third]){
  assert.deepEqual(strike.boss.purgePoints,points);
  assert.equal(strike.actor.hp,before.actor.hp);
  assert.ok(strike.boss.flow.level>0);
 }
 const recovery=await at('FOV03',374,410);
 assert.equal(recovery.boss.recoveryTicks+recovery.boss.tick,516);
 assert.equal(recovery.boss.flow,undefined);
 assert.equal(recovery.actor.hp,before.actor.hp);
 console.log('Cooled the locked purge, avoided all three jets and reached recovery.');

 const partial=await saveProgress();
 assert.equal(partial.fieldBosses[boss].hp,recovery.boss.hp);
 await fs.writeFile(path.join(out,'mid-fight.json'),JSON.stringify(partial,null,2)+'\n');
 await page.locator('#loadProgress').click();
 await drive.waitNode(hub);
 assert.equal(await gear(['artifact_equip:'+feather.id,'weapon_equip:traveler:'+weapon],weapon),originalAttack);
 await skill(input.loadout[0][0]);
 await enter();
 await drive.walk(520);
 const reload=await read();
 assert.deepEqual([reload.boss.form,reload.boss.hp],['hover',partial.fieldBosses[boss].hp]);
 await drive.walk(774);
 const opening=await at('FOV01',290,323);
 await drive.walk(opening.boss.x-70);
 await face(opening.boss.x);
 await page.keyboard.down('KeyJ');
 try{await page.waitForFunction(()=>window.lab.frame.fieldBoss?.phase==='respawn',null,{timeout:4800})}
 finally{await page.keyboard.up('KeyJ')}
 const defeated=await read();
 assert.equal(defeated.returns,0);
 const reward={xp:defeated.progression.killXp-reload.progression.killXp,mora:defeated.mora-reload.mora};
 assert.ok(reward.xp>0);
 assert.equal(reward.mora,420);
 await drive.count(quest,1);
 for(const id of [shelf,road,quarry,hub])await drive.cross(id);
 const pre=await read();
 await drive.report(quest);
 const post=await read();
 assert.deepEqual([post.progression.questXp-pre.progression.questXp,post.mora-pre.mora],[8200,540]);
 const saved=await saveProgress();
 assert.deepEqual(saved.weapons,input.weapons);
 assert.deepEqual(saved.loadout,input.loadout);
 assert.deepEqual(equipment(saved),equipment(input));
 const checkpoint=path.join(out,'complete.json');
 await fs.writeFile(checkpoint,JSON.stringify(saved,null,2)+'\n');
 const fresh=await browser.newPage();
 fresh.on('pageerror',error=>errors.push(error.message));
 await importSave(fresh,checkpoint);
 const restored=await stored(fresh);
 assert.equal(restored.endgame.bosses[boss].clears,1);
 assert.deepEqual(restored.endgame.bosses['boss-26270301'],input.endgame.bosses['boss-26270301']);
 assert.deepEqual(restored.endgame.weekly,input.endgame.weekly);
 assert.equal(restored.story.quests[quest].status,'complete');
 const reports=save=>Object.values(save.story.quests).filter(q=>q.status==='complete').length;
 assert.equal(reports(restored),reports(input)+1);
 assert.deepEqual(errors,[]);
 const result={inputSha256:createHash('sha256').update(bytes).digest('hex'),level:defeated.progression.level,
  journeys:drive.journeys,gear:{trialAttack,originalAttack},purge:{points,hitTick,flowBefore:before.boss.flow.level,
   flowAfter:cooled.boss.flow.level,pausedUntilTick:hitTick+72,flowAtSecondJet:second.boss.flow.level,
   heroDamage:before.actor.hp-recovery.actor.hp,recoveryTicks:144,hpAfterReload:reload.boss.hp},
  captures:{wave,purge,chilled},reward,reportReward:{xp:8200,mora:540},fieldClears:1,
  reported:reports(restored),priorWeeklyRecordsPreserved:true,returns:defeated.returns,errors};
 await fs.writeFile(path.join(out,'browser.json'),JSON.stringify(result,null,2)+'\n');
 console.log('Verified earned Overseer clear, quest report '+result.reported+' and six pixel-identical transfers.');
}catch(error){
 const state=await read();
 console.error({node:state.node,boss:state.boss,x:state.actor.x,hp:state.actor.hp,errors});
 throw error;
}finally{await browser.close()}
