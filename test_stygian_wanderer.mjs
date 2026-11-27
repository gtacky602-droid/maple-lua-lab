import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {driveWanderer} from './tools/browser_wanderer_driver.mjs';
import {captureRectTransfer} from './tools/browser_rect_transfer.mjs';

const browser=await chromium.launch({headless:true,channel:'chrome',args:['--disable-gpu']});
const page=await browser.newPage({viewport:{width:1240,height:940}});
const hub='sumeru-hub',arena='sumeru-stygian-windcourt',quest='stygian-wanderer-commission';
const routes={'wide-edge':{marks:2,offset:60},'narrow-edge':{marks:1,offset:60},'narrow-center':{marks:1,offset:0}};
const routeId=process.env.LAB_WANDERER_WINDS;
const route=routes[routeId]||null;
const marks=route?.marks??2,width=marks===2?160:112;
const hit=marks===1&&route.offset!==0;
const prefix=(process.env.LAB_WEEKLY_EVIDENCE||'evidence')+'/stygian-wanderer'+(route?'-'+routeId:'');
const canvas=page.locator('#game'),errors=[];
const wait=(fn,arg,timeout=105000)=>page.waitForFunction(fn,arg,{timeout});
const frame=()=>page.evaluate(()=>window.lab.frame);
page.on('pageerror',e=>errors.push(e.message));

async function capture(name){
 const bytes=await canvas.evaluate(el=>el.toDataURL('image/png').split(',')[1]);
 await fs.writeFile(prefix+'-'+name+'.png',Buffer.from(bytes,'base64'));
 return bytes;
}

async function portal(node,x){
 await canvas.click();
 const toward=(await frame()).actors[0].x<x?'KeyD':'KeyA';
 await page.keyboard.down(toward);
 try{await wait(node=>window.lab.frame.storyNearbyPortal?.to===node&&window.lab.frame.storyNearbyPortal.available,node,14000);}
 finally{await page.keyboard.up(toward);}
 await page.keyboard.press('KeyF');
 await wait(node=>window.lab.frame.story.node===node,node);
}

try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8960/');
 await wait(()=>window.lab?.frame);
 await page.evaluate(raw=>localStorage.setItem('maple-lua-lab.checkpoint.v1',raw),
  await fs.readFile('work/stygian-wanderer-gear.json','utf8'));
 await page.locator('#loadProgress').click();
 await wait(node=>window.lab.frame.story?.node===node,hub);
 const row=page.locator('[data-quest="'+quest+'"]');
 await row.getByRole('button',{name:'受注',exact:true}).click();
 await wait(q=>window.lab.frame.story.quests[q]?.status==='active',quest);
 await portal(arena,443);
 const background=await page.evaluate(async()=>{
  const {backgroundReady,sceneryStatus}=await import('./scenery.js');await backgroundReady;
  return sceneryStatus(window.lab.frame);
 });
 assert.deepEqual([background.key,background.state],['windcourt','ready']);
 await wait(()=>document.getElementById('stygianMode').options.length===4);
 await page.locator('#stygianMode').selectOption('extreme');
 assert.ok(await page.locator('#stygianStart').isDisabled());
 await page.locator('#stygianMode').selectOption('normal');
 await page.locator('#stygianSet').selectOption('troupe');
 await page.locator('#stygianStart').click();
 await wait(()=>window.lab.frame.endgameRun?.match==='wanderer');
 await canvas.click();
 await capture('arrival');

 await driveWanderer(page,true,route);
 await wait(()=>window.lab.frame.endgameRun?.card==='WD02'&&window.lab.frame.endgameRun.tick>=90);
 await capture('glide');
 await wait(()=>window.lab.frame.endgameRun?.card==='WD03'&&window.lab.frame.endgameRun.phase==='recover');
 await capture('landing');
 console.log('Wanderer Chrome: reached the mid-level wind-mark recovery');
 await wait(({hit,offset})=>{
  const f=window.lab.frame,v=f.endgameRun,a=f.actors[f.active-1];
  return v?.safe&&v.safe.inside!==hit&&v.tick>=470&&Math.abs(a.x-v.safe.x-offset)<9;
 },{hit,offset:route?.offset??0});
 await page.keyboard.press('KeyP');
 await wait(()=>window.lab.frame.paused);
 const original=await frame(),png=await capture('gate');
 assert.equal(original.endgameRun.card,'WD06');
 assert.equal(original.endgameRun.windMarks,marks);
 assert.equal(original.endgameRun.finalWind.width,width);
 assert.equal(original.endgameRun.safe.inside,!hit);
 const gateText=await page.locator('#stygianMechanic').textContent();
 assert.ok(gateText.includes(`門幅 ${width}px`)&&gateText.includes(hit?'安全門へ移動':'安全門の内側'));
 assert.ok(original.draws.some(d=>d.source?.startsWith('wanderer-idle-')&&d.h===108));
 await page.locator('#renderMode').selectOption('rect');
 await page.locator('#packRectArt').uncheck();
 await wait(n=>window.lab.frame.commands>n*5,original.commands);
 const standard=await frame(),rect=await capture('standard');
 const plain=await captureRectTransfer(page,'h32c16',false,()=>page.locator('#renderMode').selectOption('h32c16'));
 const light=plain.snapshot,low=await capture('light');
 assert.deepEqual([original.t,standard.t,light.t],[original.t,original.t,original.t]);
 assert.deepEqual(original.endgameRun,light.endgameRun);
 assert.equal(new Set([png,rect,low]).size,3);
 const packed=await captureRectTransfer(page,'h32c16',true,()=>page.locator('#packRectArt').check());
 assert.equal(packed.snapshot.t,light.t);
 assert.equal(packed.raster,plain.raster);
 assert.ok(packed.snapshot.draws.some(d=>d.kind==='rect_runs'&&d.h===108));
 assert.ok(packed.snapshot.draws.length<light.draws.length&&packed.gzipBytes<plain.gzipBytes);
 await page.locator('#renderMode').selectOption('sprite');
 await wait(()=>window.lab.frame.draws.some(d=>d.source?.startsWith('wanderer-idle-')));
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.locator('#stygianBattle').evaluate(el=>el.scrollWidth<=el.clientWidth&&el.getBoundingClientRect().right<=390));
 await page.setViewportSize({width:1240,height:940});
 await canvas.click();
 await page.keyboard.press('KeyP');
 await wait(()=>{
  const v=window.lab.frame.endgameRun;
  return v?.tick>=574&&v.finalWind?.damage!==undefined;
 });
 const result=(await frame()).endgameRun.finalWind;
 const resultText=await page.locator('#stygianMechanic').textContent();
 assert.equal(result.damage>0,hit);
 assert.ok(resultText.includes(hit?`${result.damage}ダメージ`:'最後の風の被ダメージなし'));
 await page.locator('#stygianBattle').screenshot({path:prefix+'-result.png'});
 await wait(()=>window.lab.frame.endgameRun?.status==='clear');
 const victory=await frame(),trail=await page.evaluate(()=>window.wdTrail);
 assert.deepEqual(trail.stages,[1,2,3]);
 assert.equal(trail.marks.WD06,marks);
 assert.ok(trail.updrafts>=2&&trail.floorGlide);
 if(!route){
  assert.equal(trail.marks.WD03,2);
  assert.ok(trail.firstAirHit&&trail.airOpening);
 }
 assert.equal(trail.safeFinal,!hit);
 if(marks===2)assert.equal(trail.heightAtLastMark,290);
 assert.deepEqual(trail.finalContacts.filter(tick=>tick>=560),hit?[560]:[]);
 assert.equal(victory.endgame.stygian['wanderer:normal'].clears,1);
 assert.equal(victory.story.quests[quest].count,1);
 assert.equal(victory.returns,0);
 assert.equal(victory.endgameRun.matchReward.mora,8400);
 await capture('clear');
 await page.getByRole('button',{name:'挑戦入口に戻る',exact:true}).click();
 await wait(()=>window.lab.frame.stygianDesk);
 await portal(hub,84);
 await row.getByRole('button',{name:'報告',exact:true}).click();
 await wait(q=>window.lab.frame.story.quests[q]?.status==='complete',quest);
 await page.locator('#saveProgress').click();
 await wait(()=>document.getElementById('saveStatus').textContent.includes('冒険を保存しました'));
 await page.reload();
 await wait(()=>window.lab?.frame);
 await page.locator('#loadProgress').click();
 await wait(q=>window.lab.frame.story?.quests[q]?.status==='complete',quest);
 assert.deepEqual((await frame()).endgame.stygian['wanderer:normal'],victory.endgame.stygian['wanderer:normal']);
 assert.deepEqual(errors,[]);
 await fs.writeFile(prefix+'-browser.json',JSON.stringify({background,normalClear:true,trail,questReportSaveRestore:true,
  viewport390:true,route,gateText,resultText,result,commands:{png:original.commands,standard:standard.commands,light:light.commands},
  transfer:{plainDraws:light.draws.length,packedDraws:packed.snapshot.draws.length,plainGzip:plain.gzipBytes,
   packedGzip:packed.gzipBytes,identicalCanvas:true},errors},null,2)+'\n');
 console.log(`Wanderer Chrome: wind-ring jumps, ${width}px gate, ${result.damage} finale damage, reward and save passed`);
}catch(err){
 const f=await page.evaluate(()=>window.lab?.frame);
 console.error(JSON.stringify({node:f?.story?.node,t:f?.t,boss:f?.boss,run:f?.endgameRun,
  actors:f?.actors?.map(a=>[a.x,a.y,a.hp,a.dir]),portal:f?.storyNearbyPortal,trail:await page.evaluate(()=>window.wdTrail),
  events:Array.isArray(f?.events)?f.events.filter(e=>e.kind.startsWith('stygian:wanderer:')).slice(-14):[],errors},null,2));
 await page.screenshot({path:prefix+'-failure.png'});
 throw err;
}finally{await browser.close()}
