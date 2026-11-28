import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import {captureRectTransfer} from './tools/browser_rect_transfer.mjs';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const source=process.env.CRYO_EARNED_SAVE||'work/earned-anemo/complete.json';
const out=process.env.CRYO_OUTPUT||'work/earned-cryo';
const data=await fs.readFile(source);
const input=JSON.parse(data);
const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const route=['mond-town','mond-road','mond-border','cryo-approach','cryo-field-grove'];
const boss='boss-26020101',quest='cryo-commission';
const url=process.env.LAB_URL||'http://127.0.0.1:51348/';
await fs.mkdir(out,{recursive:true});
assert.ok(!input.endgame.bosses[boss]&&!input.story.quests[quest]);

const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1200,height:940}});
page.setDefaultTimeout(24000);
const drive=waypointDriver(page,Object.fromEntries(graph.nodes.map(node=>[node.id,node])));
const frame=()=>page.evaluate(()=>window.lab.frame);
const canvas=page.locator('#game'),quality=page.locator('#renderMode'),pack=page.locator('#packRectArt');
const label=page.locator('#fieldBossLabel');
const errors=[];
page.on('pageerror',error=>errors.push(error.message));

async function paused(value){
 await page.evaluate(()=>document.activeElement.blur());
 await page.keyboard.press('KeyP');
 await page.waitForFunction(value=>window.lab.frame.paused===value,value);
}

async function switchGear(actions){
 await page.evaluate(actions=>actions.forEach(key=>window.lab.action(key)),actions);
}

async function attackOnce(){
 await page.waitForFunction(()=>!(window.lab.frame.actors[0].cd.normal>0));
 const before=await frame();
 await page.evaluate(()=>document.activeElement.blur());
 await page.keyboard.down('KeyJ');
 try{
  await page.waitForFunction(hp=>window.lab.frame.fieldBoss.hp<hp,before.fieldBoss.hp,{timeout:1800});
 }finally{await page.keyboard.up('KeyJ')}
 const after=await frame();
 return {distance:before.fieldBoss.x-before.actors[0].x,damage:before.fieldBoss.hp-after.fieldBoss.hp,
  coreHits:after.fieldBoss.coreHits,downTicks:after.fieldBoss.downTicks,move:after.fieldBoss.move};
}

async function capturePose(name){
 const {t,fieldBoss:pose}=await frame();
 await canvas.screenshot({path:path.join(out,name+'-png.png')});
 const profiles={};
 for(const profile of ['h48c32','h32c16']){
  const raw=await captureRectTransfer(page,profile,false,async()=>{
   await quality.selectOption(profile);
   await pack.uncheck();
  });
  const batched=await captureRectTransfer(page,profile,true,()=>pack.check());
  assert.ok(batched.raster===raw.raster,name+' '+profile+' packed Canvas pixels differ');
  assert.equal(raw.snapshot.t,t);
  assert.equal(batched.snapshot.t,t);
  assert.ok(batched.snapshot.fieldBoss.drawCount<raw.snapshot.fieldBoss.drawCount);
  assert.ok(batched.gzipBytes<raw.gzipBytes);
  profiles[profile]={legacyDraws:raw.snapshot.fieldBoss.drawCount,packedDraws:batched.snapshot.fieldBoss.drawCount,
   legacyGzip:raw.gzipBytes,packedGzip:batched.gzipBytes,identicalPixels:true};
  await canvas.screenshot({path:path.join(out,name+'-'+profile+'.png')});
 }
 await quality.selectOption('sprite');
 return {label:pose.label,move:pose.move,downTicks:pose.downTicks,profiles};
}

try{
 await page.goto(url);
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#importSave').setInputFiles(source);
 await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('ファイルの進行で町から再開'));
 await drive.waitNode(route[0]);
 const originalAtk=(await frame()).actors[0].atk;
 await switchGear(['artifact_remove:602','artifact_equip:1187','weapon_equip:traveler:SW04']);
 await page.waitForFunction(()=>window.lab.frame.actors[0].atk===7);
 if(!(await frame()).holdAllyFire)await page.locator('#allyFire').click();
 await page.waitForFunction(()=>window.lab.frame.holdAllyFire);
 await drive.accept(quest);
 for(const node of route.slice(1))await drive.cross(node);
 await drive.walk(697);
 await page.waitForFunction(()=>window.lab.frame.fieldBoss?.phase==='combat');
 const distant=await attackOnce();
 assert.ok(distant.distance>94&&distant.damage>0);
 assert.equal(distant.coreHits,3);
 await drive.walk(730);
 const first=await attackOnce();
 const second=await attackOnce();
 assert.deepEqual([first.coreHits,second.coreHits],[2,1]);
 await page.waitForFunction(()=>window.lab.frame.fieldBoss?.move==='FC01'&&window.lab.frame.fieldBoss.tick>=36&&window.lab.frame.fieldBoss.tick<43);
 await paused(true);
 assert.match(await label.textContent(),/地上で根元に近づいて攻撃.*根元の核 あと1回/);
 const warning=await capturePose('warning');
 await paused(false);
 const third=await attackOnce();
 assert.equal(third.coreHits,0);
 assert.equal(third.downTicks,0);
 assert.match(await label.textContent(),/攻撃が終わるとダウン/);
 await page.waitForFunction(()=>window.lab.frame.fieldBoss?.downTicks>0);
 await paused(true);
 assert.match(await label.textContent(),/核を破壊・ダウン（あと[\d.]+秒）/);
 const down=await capturePose('down');
 await paused(false);
 const onGround=await attackOnce();
 assert.ok(onGround.downTicks>0&&onGround.damage>0);
 await page.waitForFunction(()=>window.lab.frame.fieldBoss?.label==='起き上がり');
 const rise=(await frame()).t;
 await page.waitForFunction(()=>window.lab.frame.fieldBoss?.coreHits===3,null,{timeout:36000});
 const rearmed=(await frame()).t;
 assert.ok(rearmed-rise>=19.8);
 console.log('Root proximity, three separate casts, deferred stun, down hit and rearm observed.');
 await page.keyboard.down('KeyJ');
 try{
  await page.waitForFunction(()=>window.lab.frame.fieldBoss?.phase==='respawn',null,{timeout:110000});
 }finally{await page.keyboard.up('KeyJ')}
 const defeated=await frame();
 assert.equal(defeated.fieldBoss.hp,0);
 assert.equal(defeated.returns,0);
 await drive.count(quest,1);
 for(const node of route.slice(0,-1).reverse())await drive.cross(node);
 const beforeReport=(await frame()).progression.questXp;
 await drive.report(quest);
 assert.equal((await frame()).progression.questXp-beforeReport,1500);
 await switchGear(['artifact_equip:10','artifact_equip:602','weapon_equip:traveler:SW07']);
 await page.waitForFunction(atk=>window.lab.frame.actors[0].atk===atk,originalAtk);
 await page.locator('#saveProgress').click();
 await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('保存しました'));
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('maple-lua-lab.checkpoint.v1')));
 const equipped=save=>save.inventory.items.filter(item=>item.owner>0).sort((a,b)=>a.id-b.id);
 assert.deepEqual(equipped(saved),equipped(input));
 assert.deepEqual(saved.weapons,input.weapons);
 assert.equal(saved.endgame.bosses[boss].clears,1);
 assert.deepEqual(saved.endgame.bosses['boss-20040201'],input.endgame.bosses['boss-20040201']);
 assert.deepEqual(saved.endgame.weekly,input.endgame.weekly);
 const checkpoint=path.join(out,'complete.json');
 await fs.writeFile(checkpoint,JSON.stringify(saved,null,2)+'\n');
 const fresh=await browser.newPage();
 await fresh.goto(url);
 await fresh.waitForFunction(()=>window.lab?.frame);
 await fresh.locator('#importSave').setInputFiles(checkpoint);
 await fresh.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('ファイルの進行で町から再開'));
 const restored=await fresh.evaluate(()=>JSON.parse(localStorage.getItem('maple-lua-lab.checkpoint.v1')));
 assert.deepEqual(restored.endgame.bosses[boss],saved.endgame.bosses[boss]);
 assert.deepEqual(restored.endgame.weekly,input.endgame.weekly);
 assert.equal(restored.story.quests[quest].status,'complete');
 assert.deepEqual(errors,[]);
 const result={inputSha256:createHash('sha256').update(data).digest('hex'),level:defeated.progression.level,
  journeys:drive.journeys,trialAtk:7,restoredAtk:originalAtk,distant,coreStrikes:[first,second,third],
  downHit:onGround,rearmSeconds:+(rearmed-rise).toFixed(3),captures:{warning,down},returns:defeated.returns,
  fieldClears:restored.endgame.bosses[boss].clears,commission:restored.story.quests[quest].status,
  reported:Object.values(restored.story.quests).filter(q=>q.status==='complete').length,priorWeeklyRecordsPreserved:true,errors};
 await fs.writeFile(path.join(out,'browser.json'),JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify(result));
}catch(error){
 const f=await frame();
 console.error({node:f?.story?.node,boss:f?.fieldBoss,x:f?.actors[0].x,atk:f?.actors[0].atk,errors});
 throw error;
}finally{
 await browser.close();
}
