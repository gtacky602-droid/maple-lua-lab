import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {checkWeeklyAtlas} from './tools/browser_weekly_atlas.mjs';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';
import {captureRectTransfer} from './tools/browser_rect_transfer.mjs';

const browser=await chromium.launch({headless:true,channel:'chrome',args:['--disable-gpu']});
const page=await browser.newPage({viewport:{width:1240,height:940}});
const wait=(fn,arg,timeout=65000)=>page.waitForFunction(fn,arg,{timeout});
const frame=()=>page.evaluate(()=>window.lab.frame);
const canvas=page.locator('#game'),prefix=(process.env.LAB_WEEKLY_EVIDENCE||'evidence')+'/false-moon-weekly';
const hub='nod-town',outer='nod-false-moon-court',inner='nod-false-moon-rift';
const quest='false-moon-weekly-commission',id='boss-29130201';
const expertSource=process.env.LAB_EARNED_SAVE;
const expectedWins=Number(process.env.LAB_EARNED_WINS||0);
assert.ok(!expectedWins||expertSource);
const expert=id+':expert',gate='boss-29122000:expert';
const equipment=save=>save.inventory.items.filter(item=>item.owner);
const events=f=>Object.values(f?.events||{});
await fs.mkdir(path.dirname(prefix),{recursive:true});
const errors=[];
page.on('pageerror',e=>errors.push(e.message));

async function capture(name){
 const bytes=await canvas.evaluate(el=>el.toDataURL('image/png').split(',')[1]);
 await fs.writeFile(prefix+'-'+name+'.png',Buffer.from(bytes,'base64'));
 return bytes;
}
async function scene(file){
 await wait(file=>window.moonSceneryDraw?.file===file,file);
 return page.evaluate(async file=>{
  const {sceneryStatus}=await import('./scenery.js');
  return {...sceneryStatus(window.lab.frame,file),tile:window.moonSceneryDraw.tile};
 },file);
}
const mode=m=>page.evaluate(m=>{window.moonMode=m},m);

async function openExpertSave(){
 const raw=await fs.readFile(expertSource,'utf8');
 const checkpoint=JSON.parse(raw);
 const {nodes}=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
 const drive=waypointDriver(page,Object.fromEntries(nodes.map(n=>[n.id,n])));
 await page.locator('#importSave').setInputFiles(expertSource);
 await wait(k=>window.lab.frame.endgame?.weekly[k]?.clears===3,gate);
 assert.equal((await frame()).progression.level,200);
 if(await drive.node()!==hub)await drive.warp(hub);
 return {checkpoint,drive,sourceSha256:createHash('sha256').update(raw).digest('hex')};
}

async function restoreExpert({drive,sourceSha256}){
 const f=await frame();
 assert.equal(f.endgame.weekly[expert].clears,expectedWins);
 assert.equal(f.story.quests[quest].status,'complete');
 assert.equal(f.actors[0].atk,74956);
 const reported=Object.values(f.story.quests).filter(q=>q.status==='complete').length;
 assert.equal(reported,119);
 await drive.walk(210);
 await page.locator('#weeklyDesk').waitFor();
 assert.equal(await page.locator('#weeklyDifficulty').inputValue(),'expert');
 const remaining=(await frame()).weeklyDesk.remaining;
 assert.ok(remaining>0&&await page.locator('#weeklyChallengeStart').isDisabled());
 await page.locator('#weeklyDesk').screenshot({path:prefix+'-restored.png'});
 assert.deepEqual(errors,[]);
 await fs.writeFile(prefix+'-restore.json',JSON.stringify({sourceSha256,expertWins:expectedWins,
  gateExpertWins:f.endgame.weekly[gate].clears,reported,attack:f.actors[0].atk,remaining,errors},null,2)+'\n');
}

async function play(){
 await page.addInitScript(()=>{
  const draw=CanvasRenderingContext2D.prototype.drawImage;
  CanvasRenderingContext2D.prototype.drawImage=function(image,...args){
   const result=draw.call(this,image,...args);
   if(this.canvas.id==='game' && image.src && args.length===8 && args[6]===1160 && args[7]===540){
    window.moonSceneryDraw={file:new URL(image.src).pathname.split('/').pop(),tile:args.slice(0,4)};
   }
   return result;
  };
 });
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8953/');
 await wait(()=>window.lab?.frame);
 const earned=expertSource&&await openExpertSave();
 if(expectedWins){
  await restoreExpert(earned);
  return;
 }
 if(earned){
  assert.ok(!earned.checkpoint.endgame.weekly[expert]&&!earned.checkpoint.story.quests[quest]);
  await page.evaluate(()=>{window.lab.action('artifact_remove:602');window.lab.action('artifact_equip:1187');});
  await wait(()=>window.lab.frame.actors[0].atk===259);
  await page.locator('#allyFire').click();
  await wait(()=>window.lab.frame.holdAllyFire);
 }else{
  await page.evaluate(raw=>localStorage.setItem('maple-lua-lab.checkpoint.v1',raw),
   await fs.readFile('work/false-moon-weekly-gear.json','utf8'));
  await page.locator('#loadProgress').click();
  await wait(hub=>window.lab.frame.story?.node===hub,hub);
 }
 const row=page.locator('[data-quest="'+quest+'"]');
 await row.getByRole('button',{name:'受注',exact:true}).click();
 await wait(q=>window.lab.frame.story.quests[q]?.status==='active',quest);
 await page.locator('#playBackgroundTier').selectOption('4096');
 const atlasEntry=await checkWeeklyAtlas(page,inner,[outer,inner],'戦闘中に移動');
 let rank;
 if(earned){
  await earned.drive.walk(210);
  await page.locator('#weeklyDesk').waitFor();
  await page.locator('#weeklyDifficulty').selectOption('expert');
  await wait(()=>!document.getElementById('weeklyChallengeStart').disabled);
  rank=(await frame()).weeklyDesk.modes.find(m=>m.id==='expert');
  assert.ok(rank.available&&!rank.record);
  await page.locator('#weeklyChallengeStart').click();
 }else{
  await canvas.click();
  const toward=(await frame()).actors[0].x<210?'KeyD':'KeyA';
  await page.keyboard.down(toward);
  try{await wait(n=>window.lab.frame.storyNearbyPortal?.to===n&&window.lab.frame.storyNearbyPortal.available,outer,15000);}
  finally{await page.keyboard.up(toward);}
  await page.keyboard.press('KeyF');
 }
 await wait(n=>window.lab.frame.story.node===n,outer);
 const opening=await frame();
 if(earned)assert.equal(opening.weeklyBoss.difficulty,'最上級');
 const court=await scene('false-moon-court-native-tiers-v1.webp');
 assert.deepEqual(court.tile,[0,0,512,288]);
 assert.deepEqual([court.key,court.state],['falseMoonCourt','ready']);
 await wait(()=>window.lab.frame.weeklyBoss?.falseMoon.rule?.state==='rule');
 const unbroken=await frame();
 assert.equal(unbroken.weeklyBoss.falseMoon.rule.kind,'still');
 assert.equal(unbroken.weeklyBoss.falseMoon.rule.violated,false);
 await page.locator('.game').screenshot({path:prefix+'-rule.png'});
 await page.keyboard.down('KeyD');
 try{await wait(()=>window.lab.frame.weeklyBoss?.falseMoon.rule?.violated);}
 finally{await page.keyboard.up('KeyD');}
 await wait(()=>window.lab.frame.weeklyBoss?.falseMoon.tick>=456);
 await canvas.click();
 await page.keyboard.press('ShiftLeft');
 await wait(()=>window.lab.frame.weeklyBoss?.falseMoon.card==='WM08');

 await page.evaluate(()=>{
  const keys=new Set();
  let faced=false;
  window.moonMode='cover';
  window.moonStages=[];
  function key(code,on){
   if(keys.has(code)===on)return;
   if(on)keys.add(code);else keys.delete(code);
   window.dispatchEvent(new KeyboardEvent(on?'keydown':'keyup',{code,bubbles:true,cancelable:true}));
  }
  function loop(){
   const f=window.lab.frame,b=f.weeklyBoss,v=b?.falseMoon;
   let left=false,right=false,attack=false;
   if(v&&!f.paused&&b.phase!=='respawn'){
    if(window.moonStages.at(-1)!==v.stage)window.moonStages.push(v.stage);
    const a=f.actors[f.active-1],mode=window.moonMode;
    let goal=a.x,target;
    if(mode==='cover')goal=160;
    else if(mode==='portal')goal=480;
    else if(mode==='shadows'){
     const shadows=Array.isArray(v.shadows)?v.shadows.filter(e=>e.hp>0):[];
     target=shadows[0]?.x;
    }else if(mode==='away'&&v.rule?.kind==='away'&&v.tick<115){
     if(!faced){
      const want=v.rule.away==='left'?-1:1;
      if(a.dir===want&&v.tick>4)faced=true;
      else goal=a.x+want*35;
     }
    }else if(mode==='finish'&&b.damageable)target=b.x;
    if(target!==undefined){
     const dx=target-a.x;
     goal=target-74;
     if(Math.abs(goal-a.x)<10&&Math.sign(dx)!==a.dir)goal=a.x+Math.sign(dx)*23;
     attack=Math.abs(dx)<115&&Math.sign(dx)===a.dir;
    }
    left=goal<a.x-10;right=goal>a.x+10;
   }
   key('KeyA',left);key('KeyD',right);key('KeyJ',attack);
   requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
 });
 const hint=page.locator('#weeklyFalseMoonHint');
 await wait(()=>window.lab.frame.weeklyBoss?.falseMoon.cover&&
  document.querySelector('#weeklyFalseMoonHint').textContent.includes('青い枠の内側で待機'));
 const wardCue=await hint.textContent();
 assert.match(wardCue,/青い枠の内側で待機.*衝撃まで[\d.]+秒/);
 await page.locator('.game').screenshot({path:prefix+'-ward.png'});
 await wait(()=>Object.values(window.lab.frame.events).some(e=>e.kind==='false-moon:WM08:ward'&&e.actor===1));
 const shielded=await frame();
 assert.equal(await page.locator('#weeklyFalseMoonHint').textContent(),'柱で衝撃を防いだ');
 assert.equal(events(shielded).filter(e=>e.kind==='false-moon:WM09:violation:walk').length,1);
 assert.equal(events(shielded).filter(e=>e.kind==='false-moon:WM12').length,1);
 await wait(()=>window.lab.frame.weeklyBoss?.falseMoon.card==='WM13');
 await mode('portal');
 await wait(()=>window.lab.frame.weeklyBoss?.falseMoon.canUse&&
  document.querySelector('#weeklyFalseMoonHint').textContent.includes('Hで異界への入場を確認'));
 const entryCue=await hint.textContent();
 assert.match(entryCue,/Hで異界への入場を確認.*受付終了まで[\d.]+秒/);
 await canvas.click();
 await page.keyboard.press('KeyH');
 await wait(()=>window.lab.frame.weeklyBoss?.falseMoon.confirm>0);
 await page.locator('#weeklyFalseMoonCancel').click();
 await wait(()=>Object.values(window.lab.frame.events).some(e=>e.kind==='false-moon:WM13:cancel'));
 await wait(()=>window.lab.frame.weeklyBoss?.falseMoon.canUse);
 await page.locator('#weeklyFalseMoonUse').click();
 await wait(n=>window.lab.frame.story.node===n,inner);
 const atlasReturn=await checkWeeklyAtlas(page,outer,[outer],'戦闘中に帰還',prefix+'-atlas-return.png');
 const other=await scene('false-moon-rift-native-tiers-v1.webp');
 assert.deepEqual(other.tile,[0,0,512,288]);
 assert.deepEqual([other.key,other.state],['falseMoonRift','ready']);
 await mode('wait');
 await wait(()=>window.lab.frame.weeklyBoss?.falseMoon.card==='WM15');
 await canvas.click();
 await page.keyboard.press('KeyP');
 await wait(()=>window.lab.frame.paused);
 const shadow=await frame();
 assert.equal(shadow.weeklyBoss.falseMoon.shadows.length,3);
 const png=await capture('png');
 await page.locator('#renderMode').selectOption('rect');
 await page.locator('#packRectArt').uncheck();
 await wait(()=>window.lab.frame.commands>10000);
 const standard=await frame(),normal=await capture('standard');
 let transfer;
 if(earned){
  const rawLight=await captureRectTransfer(page,'h32c16',false,()=>page.locator('#renderMode').selectOption('h32c16'));
  const packed=await captureRectTransfer(page,'h32c16',true,()=>page.locator('#packRectArt').check());
  assert.equal(rawLight.raster,packed.raster);
  assert.ok(rawLight.gzipBytes>packed.gzipBytes);
  transfer={rawGzip:rawLight.gzipBytes,packedGzip:packed.gzipBytes,pixelMatch:true};
 }else await page.locator('#renderMode').selectOption('h32c16');
 await wait(n=>window.lab.frame.commands<n*.7,standard.commands);
 const reduced=await frame(),light=await capture('light');
 assert.deepEqual([standard.t,reduced.t],[shadow.t,shadow.t]);
 assert.deepEqual(reduced.weeklyBoss,shadow.weeklyBoss);
 assert.equal(new Set([png,normal,light]).size,3);
 await page.locator('#renderMode').selectOption('sprite');
 await wait(()=>window.lab.frame.commands<500);
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.locator('#weeklyFalseMoon').evaluate(el=>el.scrollWidth<=el.clientWidth&&el.getBoundingClientRect().right<=390));
 await page.setViewportSize({width:1240,height:940});
 await canvas.click();
 await mode('shadows');
 await page.keyboard.press('KeyP');
 await wait(n=>window.lab.frame.story.node===n&&window.lab.frame.weeklyBoss?.falseMoon.exposure>0,outer);
 const returned=await frame();
 assert.equal(returned.weeklyBoss.falseMoon.epoch,2);
 assert.equal(events(returned).filter(e=>e.kind==='false-moon:WM15:shadow').length,3);
 assert.deepEqual(events(returned).filter(e=>e.kind==='false-moon:WM16:loss').map(e=>e.value),[408]);
 assert.equal(returned.weeklyBoss.falseMoon.limit,408);
 assert.match(await page.locator('#weeklyFalseMoonHint').textContent(),/博士に408ダメージ.*反撃できる時間/);
 await page.locator('.game').screenshot({path:prefix+'-return.png'});
 await mode('away');
 await wait(()=>Object.values(window.lab.frame.events).some(e=>e.kind==='false-moon:WM10:success'));
 assert.equal(events(await frame()).filter(e=>e.kind==='false-moon:WM10:violation:facing').length,0);
 await mode('finish');
 await wait(()=>window.lab.frame.weeklyBoss?.phase==='respawn');
 const done=await frame();
 let firstReward;
 if(earned){
  firstReward={xp:rank.xp+rank.firstXp,mora:rank.mora+rank.firstMora,first:true};
  assert.equal(done.endgame.weekly[expert].clears,1);
  assert.deepEqual(done.weeklyBoss.reward,firstReward);
  assert.equal(done.progression.overflowXp-opening.progression.overflowXp,firstReward.xp);
  assert.equal(done.mora-opening.mora,firstReward.mora);
 }else assert.equal(done.endgame.bosses[id].clears,1);
 assert.equal(done.story.quests[quest].count,1);
 assert.equal(done.returns,0);
 const stages=await page.evaluate(()=>window.moonStages);
 assert.deepEqual(stages,['outer','entering','inner','returning','outer']);
 await page.getByRole('button',{name:'拠点へ：ナド・クライ・町の広場',exact:true}).click();
 await wait(hub=>window.lab.frame.story.node===hub,hub);
 const beforeReport=await frame();
 await row.getByRole('button',{name:'報告',exact:true}).click();
 await wait(q=>window.lab.frame.story.quests[q]?.status==='complete',quest);
 const reported=await frame();
 const payout=earned&&{xp:reported.progression.overflowXp-beforeReport.progression.overflowXp,mora:reported.mora-beforeReport.mora};
 if(earned){
  assert.deepEqual(payout,{xp:840000,mora:21200});
  await page.evaluate(()=>{window.lab.action('artifact_equip:10');window.lab.action('artifact_equip:602');});
  await wait(()=>window.lab.frame.actors[0].atk===74956);
 }
 await page.locator('#saveProgress').click();
 await wait(()=>document.getElementById('saveStatus').textContent.includes('冒険を保存しました'));
 await page.reload();
 await wait(()=>window.lab?.frame);
 await page.locator('#loadProgress').click();
 await wait(q=>window.lab.frame.story?.quests[q]?.status==='complete',quest);
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('maple-lua-lab.checkpoint.v1')));
 assert.equal(saved.weeklyBosses[id].hp,0);
 if(earned){
  assert.equal((await frame()).endgame.weekly[expert].clears,1);
  assert.deepEqual(saved.weapons,earned.checkpoint.weapons);
  assert.deepEqual(equipment(saved),equipment(earned.checkpoint));
  assert.equal(saved.companion,earned.checkpoint.companion);
  for(const [key,record] of Object.entries(earned.checkpoint.endgame.weekly))assert.deepEqual(saved.endgame.weekly[key],record,key);
  for(const [key,record] of Object.entries(earned.checkpoint.story.quests)){
   if(record.status==='complete')assert.deepEqual(saved.story.quests[key],record,key);
  }
  await fs.writeFile(path.join(path.dirname(prefix),'false-moon-complete.json'),JSON.stringify(saved,null,2)+'\n');
 }
 assert.deepEqual(errors,[]);
 await fs.writeFile(prefix+'-browser.json',JSON.stringify({court,other,stages,atlasEntry,atlasReturn,wardCue,entryCue,walkViolationExactlyOnce:true,coveredShock:true,
  cancelAndConfirm:true,realShadows:3,settlement:408,lookAwaySuccess:true,clearReportRestore:true,viewport390:true,
  commands:{png:shadow.commands,standard:standard.commands,light:reduced.commands},
  ...(earned&&{sourceSha256:earned.sourceSha256,expertWins:1,firstReward,payout,transfer,
   trialAttack:opening.actors[0].atk,trialHp:opening.actors[0].maxhp,remainingHp:done.actors[0].hp}),errors},null,2)+'\n');
 console.log('False Moon Chrome: decree, ward, cancel and enter, three shadows, return, clear, report and save passed');
}

try{
 await play();
}catch(error){
 const f=await page.evaluate(()=>window.lab?.frame);
 console.error(JSON.stringify({node:f?.story?.node,t:f?.t,boss:f?.weeklyBoss,actors:f?.actors?.map(a=>[a.x,a.y,a.hp,a.dir]),
  quest:f?.story?.quests?.[quest],nearbyPortal:f?.storyNearbyPortal,
  stages:await page.evaluate(()=>window.moonStages),events:Array.isArray(f?.events)?f.events.filter(e=>e.kind.startsWith('false-moon:')).slice(-24):[],
  status:await page.locator('#status').textContent(),errors},null,2));
 await page.screenshot({path:'work/false-moon-weekly-failure.png'});
 throw error;
}finally{
 await browser.close();
}
