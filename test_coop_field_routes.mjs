import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';
import { waypointDriver } from './tools/browser_waypoint_test.mjs';

const base=process.env.LAB_URL||'http://127.0.0.1:9020/';
const cases={
 asimon:{arena:'asimon-field-ruins',approach:'sumeru-entry',boss:'boss-24050101',quest:'asimon-commission',
  hp:1100,mora:245,xp:61650,scene:'asimonField',asset:'asimon-field',pose:'poses',label:'cloak',
  evade:{FMT01:[92,152],FMT02:[104,146,188],FMT03:[140]}},
 wenut:{arena:'wenut-field-cavern',approach:'sumeru-entry',boss:'boss-26130101',quest:'wenut-commission',
  hp:1080,mora:250,xp:71200,scene:'wenutField',asset:'wenut-field',pose:'poses',label:'burrow',
  evade:{FWN01:[104],FWN02:[104],FWN03:[140,188]}},
 dendro:{arena:'dendro-hypostasis-field-den',approach:'sumeru-field',boss:'boss-20040701',
  quest:'dendro-hypostasis-commission',hp:1120,mora:240,xp:53350,scene:'dendroHypostasisField',
  asset:'dendro-hypostasis-field',pose:'poses',label:'plunge',
  evade:{FHD01:[92,146],FHD02:[110],FHD03:[92,128,164]}},
 cryo:{hub:'mond-town',transit:['mond-road','mond-border'],arena:'cryo-field-grove',approach:'cryo-approach',
  boss:'boss-26020101',quest:'cryo-commission',hp:570,mora:125,xp:900,scene:'cryoField',
  asset:'cryo-regisvine-field',pose:'actions',label:'down',stance:78,observeDown:true,
  fixture:'cryo-regisvine-field',evade:{FC01:[68],FC02:[74],FC03:[62,86]}},
 pyro:{hub:'liyue-harbor',transit:['liyue-field'],arena:'pyro-field-grotto',approach:'pyro-approach',
  boss:'boss-26020201',quest:'pyro-commission',hp:710,mora:150,xp:4900,scene:'pyroField',
  asset:'pyro-regisvine-field',pose:'actions',label:'down',stance:78,observeDown:true,
  fixture:'pyro-regisvine-field',evade:{FP01:[80],FP02:[68,106],FP03:[86]}},
 'electro-regisvine':{arena:'electro-regisvine-field-cave',approach:'sumeru-field',
  boss:'boss-26020301',quest:'electro-regisvine-commission',hp:1240,mora:225,xp:39950,scene:'electroVineField',
  asset:'electro-regisvine-field',pose:'poses',label:'down',stance:78,observeDown:true,
  fixture:'electro-regisvine-field',evade:{FER01:[92],FER02:[80,128],FER03:[104,146,188]}},
 primo:{hub:'liyue-harbor',transit:['liyue-field'],arena:'primo-field-vault',approach:'primo-approach',
  boss:'boss-26050101',quest:'primo-commission',hp:970,mora:165,xp:8500,scene:'primoField',
  asset:'primo-geovishap-field',pose:'actions',label:'shield',stance:104,
  fixture:'primo-geovishap-field',shieldMove:'FV03',evade:{FV01:[80,140],FV02:[92],FV03:[128]}},
 oceanid:{hub:'liyue-harbor',transit:['liyue-field'],arena:'oceanid-field-reservoir',approach:'oceanid-approach',
  boss:'boss-20050101',quest:'oceanid-commission',hp:900,mora:170,xp:12250,scene:'oceanidField',
  asset:'oceanid-field',label:'frog',fixture:'oceanid-field',report:true,evade:{FO01:[84],FO02:[74,122],FO03:[110]}},
 maguu:{hub:'inazuma-port',transit:['inazuma-road'],arena:'maguu-field-dojo',approach:'maguu-approach',
  boss:'boss-25090101',quest:'maguu-commission',hp:900,mora:180,xp:14950,scene:'maguuField',
  asset:'maguu-field',label:'mask',fixture:'maguu-field',report:true,evade:{FMK01:[122],FMK02:[80,140],FMK03:[97]}},
 array:{hub:'inazuma-port',transit:['inazuma-road'],arena:'array-field-court',approach:'array-approach',
  boss:'boss-24021101',quest:'array-commission',hp:960,mora:185,xp:17450,scene:'arrayField',
  asset:'array-field',pose:'poses',label:'rocket',fixture:'array-field',report:true,
  flight:{move:'FPA03',height:108,offset:39.6,warning:'#f0ae68',warningY:474},
  evade:{FPA01:[92],FPA02:[87],FPA03:[110]}},
 thunder:{hub:'inazuma-port',transit:['inazuma-road'],arena:'thunder-field-crest',approach:'thunder-approach',
  boss:'boss-20070101',quest:'thunder-commission',hp:940,mora:190,xp:20350,scene:'thunderField',
  asset:'thunder-field',pose:'poses',label:'flight',fixture:'thunder-field',report:true,
  flight:{move:'FTM03',height:89,offset:35.2,warning:'#da98ee',warningY:476},
  evade:{FTM01:[92],FTM02:[80,104,128],FTM03:[104]}}
};
const saveKey='maple-lua-lab.checkpoint.v1';
const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const nodes=Object.fromEntries(graph.nodes.map(n=>[n.id,n]));
const selected=process.argv.slice(2);
for(const key of selected) assert.ok(cases[key],`Unknown encounter: ${key}`);
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-gpu']});
const errors=[];

async function start(fixture,{hub='sumeru-hub',quest,approach,transit=[]},accepted) {
 const context=await browser.newContext({viewport:{width:1220,height:940}});
 const page=await context.newPage();
 page.setDefaultTimeout(45000);
 page.on('pageerror',error=>errors.push(error.message));
 page.on('response',r=>{
  if(r.url().endsWith('/api/frame')&&!r.ok()) errors.push('Frame HTTP '+r.status());
 });
 await page.goto(base);
 await page.waitForFunction(()=>window.lab?.frame);
 const save=structuredClone(fixture);
 if(!accepted) delete save.story.quests[quest];
 await page.evaluate(([key,data])=>localStorage.setItem(key,JSON.stringify(data)),[saveKey,save]);
 await page.locator('#loadProgress').click();
 const route=waypointDriver(page,nodes,{walkTimeout:22000});
 await route.waitNode(hub);
 for(const node of [...transit,approach]) await route.cross(node);
 await page.locator('#coopPanel summary').click();
 return {page,route};
}

async function fight(page,side,key,config) {
 await page.evaluate(({side,key,config})=>{
  document.activeElement.blur();
  const held=new Set(),moves=new Set(),hits=new Map();
  const markers=new Set(),emerged=new Set(),air=new Set(),down=new Set();
  const forms=new Set(),landings=new Set(),maskPaths=new Set(),flightTargets=new Set();
  const art=config.pose&&config.asset+'-'+config.pose+'-source-v1.png';
  const entity=Number(config.boss.slice(5));
  const start=window.lab.frame;
  let cloaked=false,lastMove,lastTick,used=new Set(),capture=null,guardTick=null,recovery=0,shieldUsed=false;
  function hold(code,on) {
   if(on===held.has(code)) return;
   if(on) held.add(code); else held.delete(code);
   window.dispatchEvent(new KeyboardEvent(on?'keydown':'keyup',{code,bubbles:true,cancelable:true}));
  }
  function control(){
   const f=window.lab.frame,b=f.fieldBoss,a=f.actors[f.active-1];
   for(const event of Array.isArray(f.events)?f.events:[]) {
    if(event.actor===1&&event.kind==='hit'&&event.target===entity&&event.t>=start.t) hits.set(event.seq,event.value);
   }
   if(!f.coop?.code||b?.phase==='respawn'||f.returns>start.returns||f.t-start.t>105){
    for(const code of [...held]) hold(code,false);
    window.coopSumeru={seconds:+(f.t-start.t).toFixed(2),hp:a.hp,kills:f.kills-start.kills,startingMora:start.mora,
     mora:f.mora-start.mora,startingXp:start.progression.killXp,xp:f.progression.killXp-start.progression.killXp,
     moves:[...moves].sort(),manualDamage:[...hits.values()].reduce((sum,v)=>sum+v,0),cloaked,
     markers:[...markers],emerged:[...emerged],air:[...air],down:[...down],
     guardTick,recovery,shieldUsed,forms:[...forms].sort(),landings:[...landings],maskPaths:[...maskPaths],
     flightTargets:[...flightTargets]};
    return;
   }
   if(!b) {
    hold('KeyD',true);
    requestAnimationFrame(control);
    return;
   }
   if(b.move!==lastMove||b.tick<lastTick){lastMove=b.move;used=new Set()}
   lastTick=b.tick;
   if(b.move) moves.add(b.move);
   const sprite=art&&f.draws.find(d=>d.source===art);
   let visual=false;
   if(key==='asimon'&&b.cloaked&&sprite?.opacity===.45){
    cloaked=true;
    visual=true;
   }
   if(key==='wenut'&&b.move==='FWN03'){
    const mark=f.draws.find(d=>d.w===38&&d.color==='#e3b572');
    if(b.underground&&!sprite&&mark&&Math.abs(mark.x+19+f.camera-b.emergeX)<0.001){
     const screenX=b.emergeX-f.camera;
     visual=[-44,34].every(offset=>f.draws.some(d=>d.w===10&&d.color==='#eaffd8'&&
      Math.abs(d.x-(screenX+offset))<0.001));
     if(visual) markers.add(b.emergeX);
    }
    if(!b.underground&&sprite&&b.tick>=114&&b.tick<144&&Math.abs(sprite.x+f.camera-b.x)<0.001)
     emerged.add(b.x);
   }
   if(key==='dendro'&&b.move==='FHD02'&&b.flying&&b.y<416&&sprite?.h===82&&
      sprite.y===b.y-8&&Math.abs(sprite.x+f.camera-b.x)<0.001){
    air.add([b.x.toFixed(3),b.y.toFixed(3)].join(','));
    visual=true;
   }
   if(config.observeDown&&b.coreHits===0&&b.downTicks>0&&sprite){
    down.add(Math.ceil(b.downTicks/12)*12);
    visual=true;
   }
   if(config.shieldMove&&b.guardTick!==undefined){
    guardTick=b.guardTick;
    recovery=Math.max(recovery,b.recoveryTicks??0);
    visual=b.label==='盾で受けた・隙＋1秒'&&Boolean(sprite);
   }
   if(key==='oceanid'){
    const mimic=f.draws.find(d=>d.source==='oceanid-'+b.form+'-source-v1.png');
    if(mimic&&f.draws.some(d=>d.source==='oceanid-source-v1.png')) forms.add(b.form);
    if(b.move==='FO03'&&b.flying&&b.y<420&&mimic?.y===b.y&&Math.abs(mimic.x+f.camera-b.x)<.001){
     visual=f.draws.some(d=>d.kind==='rect'&&d.y===469&&d.h===3&&d.color==='#ffca93'&&
      Math.abs(d.x+d.w/2+f.camera-b.landingX)<.001);
     if(visual) landings.add(b.landingX);
    }
   }
   if(key==='maguu'&&b.move==='FMK03'&&b.tick>94&&b.tick<144){
    const mask=f.draws.find(d=>d.source==='maguu-mask-source-v1.png');
    const dir=Math.sign(b.maskX-b.x);
    const distance=44+(b.tick-90)*3*88/60;
    if(mask&&Math.abs(mask.x+f.camera-b.maskX)<.001&&Math.abs(b.x+dir*distance-b.maskX)<.001){
     maskPaths.add([b.x.toFixed(3),dir].join(','));
     visual=true;
    }
   }
   if(key==='array'&&b.form&&sprite) forms.add(b.form);
   const flight=config.flight;
   if(flight&&b.move===flight.move&&b.flying&&b.y<426&&sprite?.h===flight.height&&
      Math.abs(sprite.y-(b.y-flight.offset))<.001&&Math.abs(sprite.x+f.camera-b.x)<.001){
    const center=key==='array'?b.destinationX:(b.destinationX+b.x)/2;
    visual=f.draws.some(d=>d.kind==='rect'&&d.color===flight.warning&&d.y===flight.warningY&&d.h===3&&
     Math.abs(d.x+d.w/2+f.camera-center)<.001);
    if(visual) flightTargets.add(b.destinationX);
   }
   if(visual&&!capture&&side===-1){
    capture=document.querySelector('#game').toDataURL('image/png').split(',')[1];
    window.coopSumeruCapture=capture;
   }
   const prepareShield=side===1&&config.shieldMove&&b.move===config.shieldMove;
   if(prepareShield&&b.tick>=91&&b.tick<107&&!used.has('shield')){
    used.add('shield');
    shieldUsed=true;
    hold('Digit1',true);hold('Digit1',false);
   }
   for(const at of prepareShield?[]:config.evade[b.move]||[]) {
    if(b.tick>=at&&b.tick<at+6&&!used.has(at)){
     used.add(at);hold('ShiftLeft',true);hold('ShiftLeft',false);
    }
   }
   const dx=b.x-a.x,desired=b.x+side*(config.stance??104);
   const position=desired-a.x,turn=Math.abs(dx)>8&&dx*a.dir<0;
   hold('KeyA',position<-7||(Math.abs(position)<=7&&turn&&dx<0));
   hold('KeyD',position>7||(Math.abs(position)<=7&&turn&&dx>0));
   hold('KeyJ',Math.abs(dx)<125&&dx*a.dir>=0);
   requestAnimationFrame(control);
  }
  requestAnimationFrame(control);
 },{side,key,config});
}

async function run(key,config) {
 const {arena,boss,quest,hp,mora,xp,asset,scene,label}=config;
 const fixture=JSON.parse(await fs.readFile('work/'+(config.fixture??'coop-'+key)+'-fixture.json','utf8'));
 const players=await Promise.all([start(fixture,config,true),start(fixture,config,false)]);
 const [{page:host},{page:guest}]=players;
 await host.locator('#coopCreate').click();
 await host.waitForFunction(()=>window.lab.frame.coop?.code);
 const code=await host.evaluate(()=>window.lab.frame.coop.code);
 await guest.locator('#coopCode').fill(code);
 await guest.locator('#coopJoin').click();
 await guest.waitForFunction(code=>window.lab.frame.coop?.code===code,code);
 await Promise.all(players.map(({route})=>route.cross(arena)));
 await Promise.all(players.map(({page})=>page.waitForFunction(({code,hp})=>{
  const coop=window.lab.frame.coop;
  return coop.code===code&&coop.enemies[0]?.maxhp===hp&&coop.peers[0]?.actors.length===2;
 },{code,hp})));
 for(const {page} of players) {
  const actual=await page.evaluate(async()=>{
   const {sceneryStatus,loadScenery}=await import('./scenery.js');
   await loadScenery(window.lab.frame);
   return sceneryStatus(window.lab.frame);
  });
  assert.deepEqual(actual,{key:scene,file:asset+'-background-v1.png',state:'ready'});
 }
 await Promise.all([fight(host,-1,key,config),fight(guest,1,key,config)]);
 await Promise.all(players.map(({page})=>page.waitForFunction(()=>window.coopSumeru,null,{timeout:130000})));
 const results=await Promise.all(players.map(({page})=>page.evaluate(()=>window.coopSumeru)));
 const moves=Object.keys(config.evade);
 for(const r of results){
  assert.ok(r.kills===1&&r.mora===mora&&r.xp===xp&&r.hp>0&&r.manualDamage>0,JSON.stringify(r));
  if(!config.observeDown) assert.deepEqual(r.moves,moves);
 }
 const [a,b]=results;
 if(key==='asimon') assert.ok(a.cloaked&&b.cloaked);
 if(key==='wenut')
  assert.ok(a.markers.some(x=>b.markers.includes(x)&&a.emerged.includes(x)&&b.emerged.includes(x)),JSON.stringify(results));
 if(key==='dendro') assert.ok(a.air.some(p=>b.air.includes(p)),JSON.stringify(results));
 if(config.observeDown) assert.ok(a.down.some(t=>b.down.includes(t)),JSON.stringify(results));
 if(config.shieldMove)
  assert.ok(!a.shieldUsed&&b.shieldUsed&&a.guardTick===132&&b.guardTick===132&&
   a.recovery>120&&b.recovery>120,JSON.stringify(results));
 if(key==='oceanid'){
  for(const r of results) assert.deepEqual(r.forms,['boar','crane','frog']);
  assert.ok(a.landings.some(x=>b.landings.includes(x)),JSON.stringify(results));
 }
 if(key==='maguu') assert.ok(a.maskPaths.some(path=>b.maskPaths.includes(path)),JSON.stringify(results));
 if(key==='array'){
  for(const r of results) assert.deepEqual(r.forms,['blade','core','rocket','wheel']);
 }
 if(config.flight) assert.ok(a.flightTargets.some(x=>b.flightTargets.includes(x)),JSON.stringify(results));
 const questCounts=await Promise.all(players.map(({page})=>page.evaluate(q=>window.lab.frame.story.quests[q]?.count??null,quest)));
 assert.deepEqual(questCounts,[1,null]);
 const saves=[];
 for(const {page} of players) {
  await page.locator('#saveProgress').click();
  await page.waitForFunction(([key,id])=>JSON.parse(localStorage.getItem(key))?.endgame?.bosses?.[id]?.clears===1,[saveKey,boss]);
  saves.push(await page.evaluate(([key,id])=>{
   const checkpoint=JSON.parse(localStorage.getItem(key));
   return {clears:checkpoint.endgame.bosses[id].clears,mora:checkpoint.mora,xp:checkpoint.progression.killXp,
    respawn:checkpoint.fieldBosses[id].waitTicks>0};
  },[saveKey,boss]));
 }
 assert.deepEqual(saves,results.map(r=>({clears:1,mora:r.startingMora+mora,xp:r.startingXp+xp,respawn:true})));
 let report;
 if(config.report){
  for(const node of [config.approach,...config.transit.toReversed(),config.hub])
   await Promise.all(players.map(({route})=>route.cross(node)));
  const rewardState=()=>host.evaluate(()=>[window.lab.frame.progression.questXp,window.lab.frame.mora]);
  const before=await rewardState();
  await players[0].route.report(quest);
  const [afterXp,afterMora]=await rewardState();
  assert.deepEqual([afterXp-before[0],afterMora-before[1]],[4000,300]);
  assert.equal(await guest.evaluate(q=>window.lab.frame.story.quests[q]??null,quest),null);
  await host.locator('#saveProgress').click();
  await host.waitForFunction(([key,q])=>JSON.parse(localStorage.getItem(key))?.story.quests[q]?.status==='complete',
   [saveKey,quest]);
  report={hub:config.hub,hostSaved:true,guestQuest:null,xp:afterXp-before[0],mora:afterMora-before[1]};
 }
 assert.deepEqual(errors,[]);
 const shot=await host.evaluate(()=>window.coopSumeruCapture);
 assert.ok(shot,'Expected canvas capture for '+key);
 await fs.writeFile('evidence/coop-'+key+'-'+label+'.png',Buffer.from(shot,'base64'));
 await fs.writeFile('evidence/coop-'+key+'-browser.json',JSON.stringify({
  browser:'Chrome',participants:2,bossHp:hp,results,questCounts,saves,report,scenery:scene,errors
 },null,2)+'\n');
 console.log(`Chrome: ${key}, each player attacked, cleared, received ${xp} XP and ${mora} mora, and saved.`);
 await Promise.all(players.map(({page})=>page.context().close()));
}

try{
 for(const key of selected.length?selected:Object.keys(cases)) await run(key,cases[key]);
} finally {
 await browser.close();
}
