import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import {captureRectTransfer} from './tools/browser_rect_transfer.mjs';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const source=process.env.PRIMO_EARNED_SAVE||'work/earned-oceanid/complete.json';
const out=process.env.PRIMO_OUTPUT||'work/earned-primo';
const url=process.env.LAB_URL||'http://127.0.0.1:51352/';
const bytes=await fs.readFile(source),input=JSON.parse(bytes);
const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const route=['liyue-harbor','liyue-field','primo-approach','primo-field-vault'];
const boss='boss-26050101',quest='primo-commission';
assert.ok(!input.endgame.bosses[boss]&&!input.story.quests[quest]);
await fs.mkdir(out,{recursive:true});

const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1200,height:940}});
page.setDefaultTimeout(24000);
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
const drive=waypointDriver(page,Object.fromEntries(graph.nodes.map(node=>[node.id,node])));
const canvas=page.locator('#game'),quality=page.locator('#renderMode'),pack=page.locator('#packRectArt');
const label=page.locator('#fieldBossLabel');
const read=()=>page.evaluate(()=>{
 const {t,fieldBoss,actors:[actor],mora,progression,returns,holdAllyFire,story}=window.lab.frame;
 return {t,fieldBoss,actor,mora,progression,returns,holdAllyFire,node:story.node};
});

async function at(move,min){
 const state=await page.waitForFunction(([move,min])=>{
  const {fieldBoss:b,actors:[a]}=window.lab.frame;
  if(b?.move===move&&b.tick>=min){
   return {boss:b,actor:a,label:document.querySelector('#fieldBossLabel').textContent};
  }
 },[move,min]);
 return state.jsonValue();
}

async function setSkill(id){
 const slot=page.getByLabel('枠1の1番目',{exact:true});
 if(!await slot.isVisible())await page.getByText('スキル装着・全100技の制作状況',{exact:true}).click();
 await slot.selectOption(id);
 await page.locator('#applySlots').click();
 await page.waitForFunction(id=>window.lab.frame.loadout[0][0]===id,id);
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
 await canvas.screenshot({path:path.join(out,name+'-png.png')});
 const profiles={};
 for(const profile of ['h48c32','h32c16']){
  const raw=await captureRectTransfer(page,profile,false,async()=>{
   await quality.selectOption(profile);
   await pack.uncheck();
  });
  const batched=await captureRectTransfer(page,profile,true,()=>pack.check());
  assert.ok(batched.raster===raw.raster,name+' '+profile+' packed pixels differ');
  assert.equal(raw.snapshot.t,t);
  assert.equal(batched.snapshot.t,t);
  assert.ok(batched.snapshot.fieldBoss.drawCount<raw.snapshot.fieldBoss.drawCount&&batched.gzipBytes<raw.gzipBytes);
  profiles[profile]={legacyDraws:raw.snapshot.fieldBoss.drawCount,packedDraws:batched.snapshot.fieldBoss.drawCount,
   legacyGzip:raw.gzipBytes,packedGzip:batched.gzipBytes,identicalPixels:true};
  await canvas.screenshot({path:path.join(out,name+'-'+profile+'.png')});
 }
 await quality.selectOption('sprite');
 await pause(false);
 return {label:pose.label,tick:pose.tick,guardTick:pose.guardTick,recoveryTicks:pose.recoveryTicks,profiles};
}

function measureOpening(opened,expected,shielded){
 const {boss:b,label:text}=opened;
 assert.equal(b.tick+b.recoveryTicks-168,expected*60);
 assert.equal(b.guardTick===132,shielded);
 assert.match(text,new RegExp('反撃できる時間 あと'+expected+'\\.0秒'));
 return {startTick:168,observedAt:b.tick,endTick:b.tick+b.recoveryTicks,seconds:expected,display:text};
}

try{
 await page.goto(url);
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#importSave').setInputFiles(source);
 await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('ファイルの進行で町から再開'));
 await drive.waitNode(route[0]);
 const originalAtk=(await read()).actor.atk;
 await page.evaluate(()=>window.lab.action('artifact_remove:602'));
 await page.waitForFunction(atk=>window.lab.frame.actors[0].atk<atk,originalAtk);
 const trialAtk=(await read()).actor.atk;
 assert.ok(trialAtk>200&&trialAtk<270);
 await setSkill('SK20');
 if(!(await read()).holdAllyFire)await page.locator('#allyFire').click();
 await page.waitForFunction(()=>window.lab.frame.holdAllyFire);
 await drive.accept(quest);
 for(const node of route.slice(1))await drive.cross(node);
 await drive.walk(773);
 await at('FV03',90);
 assert.match(await label.textContent(),/原岩の噴出・盾で受けるか跳び越す/);
 const before=(await read());
 assert.equal(before.fieldBoss.element,'hydro');
 const plainStart=await at('FV03',124);
 assert.equal(plainStart.actor.waterShield,undefined);
 const plainEnd=await at('FV03',145);
 const plainDamage=plainStart.actor.hp-plainEnd.actor.hp;
 assert.equal(plainDamage,22);
 const plain=measureOpening(await at('FV03',168),2,false);
 const normalRecovery=await capture('ordinary',/反撃できる時間 あと[\d.]+秒/);
 await at('FV01',0);
 const shieldStart=await at('FV03',94);
 assert.equal(shieldStart.boss.generation,plainStart.boss.generation);
 assert.equal(shieldStart.boss.x,plainStart.boss.x);
 assert.equal(shieldStart.actor.x,plainStart.actor.x);
 await page.keyboard.press('Digit1');
 await page.waitForFunction(()=>window.lab.frame.actors[0].waterShield?.hp>22);
 const fullShield=(await at('FV03',124)).actor.waterShield.hp;
 const shieldImpact=await at('FV03',134);
 const shieldDamage=shieldStart.actor.hp-shieldImpact.actor.hp;
 assert.equal(shieldDamage,0);
 assert.equal(fullShield-shieldImpact.actor.waterShield.hp,22);
 assert.equal(shieldImpact.boss.guardTick,132);
 const absorbed=await capture('shield',/盾で受けた・隙＋1秒/);
 const shielded=measureOpening(await at('FV03',168),3,true);
 await at('FV03',290);
 const extension=await capture('extended',/盾で受けた・隙＋1秒.*反撃できる時間/);
 assert.ok(extension.tick>plain.endTick&&extension.tick<shielded.endTick);
 const last=(await read()).fieldBoss;
 assert.ok(last.tick>288&&last.recoveryTicks>0);
 await page.keyboard.down('KeyJ');
 let hit;
 try{
  const seen=await page.waitForFunction(hp=>{
   const b=window.lab.frame.fieldBoss;
   if(b?.move==='FV03'&&b.tick>288&&b.phase==='combat'&&b.hp<hp)return {tick:b.tick,hp:b.hp};
  },last.hp,{timeout:1500});
  hit=await seen.jsonValue();
  await page.waitForFunction(()=>window.lab.frame.fieldBoss?.phase==='respawn',null,{timeout:9000});
 }finally{await page.keyboard.up('KeyJ')}
 assert.ok(last.hp-hit.hp>0&&hit.tick<348);
 const defeated=await read();
 assert.equal(defeated.returns,0);
 const reward={xp:defeated.progression.killXp-before.progression.killXp,mora:defeated.mora-before.mora};
 assert.deepEqual(reward,{xp:255,mora:165});
 console.log('Same-generation unshielded and shielded recovery windows and late attack confirmed.');

 await drive.count(quest,1);
 for(const node of route.slice(0,-1).reverse())await drive.cross(node);
 const priorReport=(await read()).progression.questXp;
 await drive.report(quest);
 assert.equal((await read()).progression.questXp-priorReport,4000);
 await setSkill(input.loadout[0][0]);
 await page.evaluate(()=>window.lab.action('artifact_equip:602'));
 await page.waitForFunction(atk=>window.lab.frame.actors[0].atk===atk,originalAtk);
 await page.locator('#saveProgress').click();
 await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('保存しました'));
 const checkpoint=path.join(out,'complete.json');
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('maple-lua-lab.checkpoint.v1')));
 assert.deepEqual(saved.loadout,input.loadout);
 const equipped=save=>save.inventory.items.filter(item=>item.owner>0).sort((a,b)=>a.id-b.id);
 assert.deepEqual(equipped(saved),equipped(input));
 await fs.writeFile(checkpoint,JSON.stringify(saved,null,2)+'\n');
 const fresh=await browser.newPage();
 await fresh.goto(url);
 await fresh.waitForFunction(()=>window.lab?.frame);
 await fresh.locator('#importSave').setInputFiles(checkpoint);
 await fresh.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('ファイルの進行で町から再開'));
 const restored=await fresh.evaluate(()=>JSON.parse(localStorage.getItem('maple-lua-lab.checkpoint.v1')));
 assert.equal(restored.endgame.bosses[boss].clears,1);
 assert.deepEqual(restored.endgame.bosses['boss-20050101'],input.endgame.bosses['boss-20050101']);
 assert.deepEqual(restored.endgame.weekly,input.endgame.weekly);
 assert.equal(restored.story.quests[quest].status,'complete');
 assert.deepEqual(errors,[]);
 const result={inputSha256:createHash('sha256').update(bytes).digest('hex'),level:defeated.progression.level,
  journeys:drive.journeys,trialAtk,restoredAtk:originalAtk,element:before.fieldBoss.element,
  unshielded:{damage:plainDamage,...plain},shielded:{damage:shieldDamage,absorbed:22,...shielded},
  lateAttack:{tick:hit.tick,damage:last.hp-hit.hp},captures:{normalRecovery,absorbed,extension},reward,
  fieldClears:restored.endgame.bosses[boss].clears,commission:restored.story.quests[quest].status,
  reported:Object.values(restored.story.quests).filter(q=>q.status==='complete').length,
  priorWeeklyRecordsPreserved:true,returns:defeated.returns,errors};
 await fs.writeFile(path.join(out,'browser.json'),JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify(result));
}catch(error){
 const f=await read();
 console.error({node:f?.node,field:f?.fieldBoss,actor:f?.actor&&{x:f.actor.x,y:f.actor.y,hp:f.actor.hp,atk:f.actor.atk},errors});
 throw error;
}finally{await browser.close()}
