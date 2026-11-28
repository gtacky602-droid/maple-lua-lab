import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import {captureRectTransfer} from './tools/browser_rect_transfer.mjs';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const source=process.env.OCEANID_EARNED_SAVE||'work/earned-geo/complete.json';
const out=process.env.OCEANID_OUTPUT||'work/earned-oceanid';
const url=process.env.LAB_URL||'http://127.0.0.1:51351/';
const bytes=await fs.readFile(source),input=JSON.parse(bytes);
const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const route=['liyue-harbor','liyue-field','oceanid-approach','oceanid-field-reservoir'];
const boss='boss-20050101',quest='oceanid-commission';
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
  if(b?.move===move&&b.tick>=min)return {fieldBoss:b,actor:a};
 },[move,min]);
 return state.jsonValue();
}

async function pause(value){
 await page.evaluate(()=>document.activeElement.blur());
 await page.keyboard.press('KeyP');
 await page.waitForFunction(value=>window.lab.frame.paused===value,value);
}

async function capture(form,expectedLabel){
 await pause(true);
 const {t,fieldBoss:pose}=await read();
 assert.equal(pose.form,form);
 assert.match(await label.textContent(),expectedLabel);
 const art=await page.evaluate(()=>window.lab.frame.draws.filter(d=>d.source?.startsWith('oceanid-')));
 assert.deepEqual(art.map(d=>d.source),['oceanid-source-v1.png','oceanid-'+form+'-source-v1.png']);
 assert.equal(art[1].y,pose.y);
 await canvas.screenshot({path:path.join(out,form+'-png.png')});
 const profiles={};
 for(const profile of ['h48c32','h32c16']){
  const raw=await captureRectTransfer(page,profile,false,async()=>{
   await quality.selectOption(profile);
   await pack.uncheck();
  });
  const packed=await captureRectTransfer(page,profile,true,()=>pack.check());
  assert.ok(packed.raster===raw.raster,form+' '+profile+' packed pixels differ');
  assert.equal(raw.snapshot.t,t);
  assert.equal(packed.snapshot.t,t);
  assert.ok(packed.snapshot.fieldBoss.drawCount<raw.snapshot.fieldBoss.drawCount&&packed.gzipBytes<raw.gzipBytes);
  profiles[profile]={legacyDraws:raw.snapshot.fieldBoss.drawCount,packedDraws:packed.snapshot.fieldBoss.drawCount,
   legacyGzip:raw.gzipBytes,packedGzip:packed.gzipBytes,identicalPixels:true};
  await canvas.screenshot({path:path.join(out,form+'-'+profile+'.png')});
 }
 await quality.selectOption('sprite');
 await pause(false);
 return {label:pose.label,tick:pose.tick,hp:pose.hp,y:pose.y,profiles};
}

async function normalDuring(move,begin){
 const started=await page.evaluate(({move,begin})=>new Promise((resolve,reject)=>{
  let held=false;
  const deadline=performance.now()+12000;
  const key=type=>window.dispatchEvent(new KeyboardEvent(type,{code:'KeyJ',bubbles:true,cancelable:true}));
  function observe(){
   const {fieldBoss:b,actors:[a]}=window.lab.frame;
   if(performance.now()>deadline){
    if(held)key('keyup');
    reject(new Error('Normal attack did not start during '+move));
    return;
   }
   if(b?.move===move&&b.tick>=begin){
    if(!held){
     held=true;
     key('keydown');
    }else if(a.cd.normal>0){
     key('keyup');
     resolve({tick:b.tick,distance:Math.abs(b.x-a.x),ahead:(b.x-a.x)*a.dir>=0,bossY:b.y,grounded:a.ground,hp:b.hp});
     return;
    }
   }
   requestAnimationFrame(observe);
  }
  requestAnimationFrame(observe);
 }),{move,begin});
 assert.ok(started.grounded&&started.ahead&&started.distance<125&&started.tick<=begin+8,JSON.stringify(started));
 return started;
}

const equipment=save=>save.inventory.items.filter(item=>item.owner>0).sort((a,b)=>a.id-b.id);

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
 if(!(await read()).holdAllyFire)await page.locator('#allyFire').click();
 await page.waitForFunction(()=>window.lab.frame.holdAllyFire);
 await drive.accept(quest);
 for(const node of route.slice(1))await drive.cross(node);
 await drive.walk(768);
 const initial=await read();
 assert.equal(initial.fieldBoss.hp,900);
 const firstHit=await normalDuring('FO01',14);
 await at('FO01',48);
 const boar=await capture('boar',/水猪の短突進/);
 assert.ok(boar.hp>0&&boar.hp<initial.fieldBoss.hp);

 const rush=await at('FO01',116);
 await drive.walk(rush.fieldBoss.x-101);
 const transform1=await at('FO02',1);
 assert.match(transform1.fieldBoss.label,/水猪から水鶴に変化/);
 await at('FO02',48);
 const crane=await capture('crane',/水鶴の二波/);
 assert.equal(crane.hp,boar.hp);
 const transform2=await at('FO03',1);
 assert.match(transform2.fieldBoss.label,/水鶴から水蛙に変化/);
 const locked=(await at('FO03',54)).fieldBoss.landingX;
 assert.ok(Number.isFinite(locked));
 await drive.walk(locked+109);
 await page.keyboard.down('KeyA');
 try{
  await page.waitForFunction(()=>window.lab.frame.actors[0].dir===-1);
 }finally{await page.keyboard.up('KeyA')}
 await at('FO03',82);
 const frog=await capture('frog',/着地まで[\d.]+秒・床の予告から離れる/);
 assert.equal(frog.hp,boar.hp);
 assert.ok(frog.y<480);

 const airborne=await normalDuring('FO03',92);
 assert.ok(airborne.bossY<420);
 const landed=await at('FO03',126);
 assert.equal(landed.fieldBoss.hp,frog.hp);
 assert.equal(landed.fieldBoss.generation,1);
 assert.equal(landed.fieldBoss.x,locked);
 assert.equal(landed.fieldBoss.y,480);
 assert.ok(landed.actor.x-locked>72);
 console.log('Three forms share HP, landing point stayed fixed, and the ground attack missed the airborne frog.');

 await drive.walk(locked+60);
 const opening=await at('FO03',150);
 assert.match(opening.fieldBoss.label,/水蛙を攻撃（あと[\d.]+秒）/);
 const beforeKill=await read();
 assert.equal(beforeKill.actor.dir,-1);
 await page.keyboard.down('KeyJ');
 try{
  await page.waitForFunction(()=>window.lab.frame.fieldBoss?.phase==='respawn',null,{timeout:2600});
 }finally{await page.keyboard.up('KeyJ')}
 const defeated=await read();
 assert.equal(defeated.returns,0);
 assert.equal(defeated.fieldBoss.hp,0);
 const reward={xp:defeated.progression.killXp-initial.progression.killXp,mora:defeated.mora-initial.mora};
 assert.deepEqual(reward,{xp:368,mora:170});
 await drive.count(quest,1);
 for(const node of route.slice(0,-1).reverse())await drive.cross(node);
 const priorReport=(await read()).progression.questXp;
 await drive.report(quest);
 assert.equal((await read()).progression.questXp-priorReport,4000);
 await page.evaluate(()=>window.lab.action('artifact_equip:602'));
 await page.waitForFunction(atk=>window.lab.frame.actors[0].atk===atk,originalAtk);
 await page.locator('#saveProgress').click();
 await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('保存しました'));
 const checkpoint=path.join(out,'complete.json');
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('maple-lua-lab.checkpoint.v1')));
 assert.deepEqual(saved.weapons,input.weapons);
 assert.deepEqual(equipment(saved),equipment(input));
 await fs.writeFile(checkpoint,JSON.stringify(saved,null,2)+'\n');
 const fresh=await browser.newPage();
 await fresh.goto(url);
 await fresh.waitForFunction(()=>window.lab?.frame);
 await fresh.locator('#importSave').setInputFiles(checkpoint);
 await fresh.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('ファイルの進行で町から再開'));
 const restored=await fresh.evaluate(()=>JSON.parse(localStorage.getItem('maple-lua-lab.checkpoint.v1')));
 assert.equal(restored.story.node,route[0]);
 assert.equal(restored.endgame.bosses[boss].clears,1);
 assert.deepEqual(restored.endgame.bosses['boss-20040301'],input.endgame.bosses['boss-20040301']);
 assert.deepEqual(restored.endgame.weekly,input.endgame.weekly);
 assert.equal(restored.story.quests[quest].status,'complete');
 assert.deepEqual(errors,[]);
 const result={inputSha256:createHash('sha256').update(bytes).digest('hex'),level:defeated.progression.level,
  journeys:drive.journeys,trialAtk,restoredAtk:originalAtk,firstHit,airborne,landing:{locked,actual:landed.fieldBoss.x,
   floor:landed.fieldBoss.y,groundSwingDamage:frog.hp-landed.fieldBoss.hp,playerOffset:landed.actor.x-locked},
  recovery:{label:opening.fieldBoss.label,tick:opening.fieldBoss.tick,hpBefore:beforeKill.fieldBoss.hp},
  captures:{boar,crane,frog},reward,fieldClears:restored.endgame.bosses[boss].clears,
  commission:restored.story.quests[quest].status,reported:Object.values(restored.story.quests).filter(q=>q.status==='complete').length,
  priorWeeklyRecordsPreserved:true,returns:defeated.returns,errors};
 await fs.writeFile(path.join(out,'browser.json'),JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify(result));
}catch(error){
 const f=await read();
 console.error({node:f?.node,field:f?.fieldBoss,actor:f?.actor&&{x:f.actor.x,y:f.actor.y,hp:f.actor.hp,atk:f.actor.atk},errors});
 throw error;
}finally{await browser.close()}
