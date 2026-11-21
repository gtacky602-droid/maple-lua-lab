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
  asset:'oceanid-field',label:'frog',fixture:'oceanid-field',report:[4000,300],evade:{FO01:[84],FO02:[74,122],FO03:[110]}},
 maguu:{hub:'inazuma-port',transit:['inazuma-road'],arena:'maguu-field-dojo',approach:'maguu-approach',
  boss:'boss-25090101',quest:'maguu-commission',hp:900,mora:180,xp:14950,scene:'maguuField',
  asset:'maguu-field',label:'mask',fixture:'maguu-field',report:[4000,300],evade:{FMK01:[122],FMK02:[80,140],FMK03:[97]}},
 array:{hub:'inazuma-port',transit:['inazuma-road'],arena:'array-field-court',approach:'array-approach',
  boss:'boss-24021101',quest:'array-commission',hp:960,mora:185,xp:17450,scene:'arrayField',
  asset:'array-field',pose:'poses',label:'rocket',fixture:'array-field',report:[4000,300],
  flight:{move:'FPA03',height:108,offset:39.6,warning:'#f0ae68',warningY:474},
  evade:{FPA01:[92],FPA02:[87],FPA03:[110]}},
 thunder:{hub:'inazuma-port',transit:['inazuma-road'],arena:'thunder-field-crest',approach:'thunder-approach',
  boss:'boss-20070101',quest:'thunder-commission',hp:940,mora:190,xp:20350,scene:'thunderField',
  asset:'thunder-field',pose:'poses',label:'flight',fixture:'thunder-field',report:[4000,300],
  flight:{move:'FTM03',height:89,offset:35.2,warning:'#da98ee',warningY:476,warningCenter:'path'},
  evade:{FTM01:[92],FTM02:[80,104,128],FTM03:[104]}},
 'cryo-cube':{hub:'dragonspine-camp',transit:[],approach:'dragonspine-depth',arena:'cryo-hypostasis-field-basin',
  boss:'boss-20040501',quest:'cryo-hypostasis-commission',hp:785,mora:145,xp:1150,scene:'cryoHypostasisField',
  asset:'cryo-hypostasis-field',pose:'poses',label:'fall',fixture:'cryo-hypostasis-field',report:[1500,300],
  fallTell:{move:'FHC03',color:'#ffdfa6',captureAt:98},observeRecovery:true,
  evade:{FHC01:[104],FHC02:[86],FHC03:[104,140,176]}},
 'pyro-cube':{hub:'inazuma-town',transit:[],approach:'inazuma-town',arena:'pyro-hypostasis-field-terrace',
  boss:'boss-20040601',quest:'pyro-hypostasis-commission',hp:990,mora:195,xp:23750,scene:'pyroHypostasisField',
  asset:'pyro-hypostasis-field',pose:'poses',label:'fist',fixture:'pyro-hypostasis-field',report:[4000,300],
  flight:{move:'FHP03',height:102,offset:13,warning:'#ee9557',warningY:474,warningHeight:2},
  observeRecovery:true,evade:{FHP01:[104],FHP02:[92,128,164],FHP03:[110]}},
 'hydro-cube':{hub:'inazuma-port',transit:[],approach:'watatsumi-landing',arena:'hydro-hypostasis-field-cove',
  boss:'boss-20040401',quest:'hydro-hypostasis-commission',hp:1010,mora:200,xp:27700,scene:'hydroHypostasisField',
  asset:'hydro-hypostasis-field',pose:'poses',label:'dolphin',fixture:'hydro-hypostasis-field',report:[4000,300],
  flight:{move:'FHH01',height:94,offset:15,warning:'#e7ad7b',warningY:474,warningHeight:2},
  fallTell:{move:'FHH03',color:'#ffdfac'},observeRecovery:true,evade:{FHH01:[110],FHH02:[92,118],FHH03:[104,146,188]}},
 wolflord:{hub:'inazuma-port',transit:[],arena:'wolflord-field-ruins',approach:'tsurumi-coast',
  boss:'boss-22060101',quest:'wolflord-commission',hp:1100,mora:210,xp:32300,scene:'wolflordField',
  asset:'wolflord-field',pose:'poses',label:'skull',fixture:'wolflord-field',report:[4000,300],
  flight:{move:'FWL01',height:86,offset:44,warning:'#e8aa63',warningY:474,warningHeight:2,warningCenter:'path'},
  evade:{FWL01:[116],FWL02:[104],FWL03:[80,116]}},
 serpent:{hub:'chasm-camp',transit:['chasm-depth'],arena:'ruin-serpent-field-pit',approach:'chasm-wp-25264',
  boss:'boss-24010401',quest:'ruin-serpent-commission',hp:900,mora:150,xp:2350,scene:'ruinSerpentField',
  asset:'ruin-serpent-field',pose:'poses',label:'emerge',fixture:'ruin-serpent-field',report:[4000,300],
  evade:{FRS01:[104],FRS02:[134],FRS03:[104,146,188]}},
 bathysmal:{hub:'enkanomiya-camp',arena:'bathysmal-field-sanctum',approach:'enkanomiya-depth',
  boss:'bathysmal-herd',quest:'bathysmal-commission',hp:1120,mora:195,xp:17450,scene:'bathysmalField',
  asset:'bathysmal-field',pose:'poses',label:'relay',fixture:'bathysmal-field',report:[4000,300],
  bodies:[26050701,26050801],evade:{FBH01:[86],FBH02:[96,185],FBH03:[109,229]}},
 generator:{hub:'fontaine-hub',arena:'field-generator-field-chamber',approach:'fontaine-field',
  boss:'boss-24080101',quest:'field-generator-commission',hp:1020,mora:305,xp:129550,scene:'generatorField',
  asset:'field-generator-field',pose:'poses',label:'gravity',fixture:'field-generator-field',report:[5400,380],
  gravityJump:true,evade:{FFG01:[86,140],FFG02:[92,140],FFG03:[]}}
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
 for(const node of transit) await route.cross(node);
 if(approach!==hub) await route.cross(approach);
 await page.locator('#coopPanel summary').click();
 return {page,route};
}

async function fight(page,side,key,config) {
 await page.evaluate(({side,key,config})=>{
  document.activeElement.blur();
  const held=new Set(),moves=new Set(),hits=new Map();
  const markers=new Set(),emerged=new Set(),air=new Set(),down=new Set();
  const forms=new Set(),landings=new Set(),maskPaths=new Set(),flightTargets=new Set(),fallLayouts=new Set();
  const skullTracks=new Set(),bombLayouts=new Set(),relayTracks=new Set(),struck=new Set();
  const gravityTracks=new Set();
  const art=config.pose&&config.asset+'-'+config.pose+'-source-v1.png';
  const entities=config.bodies??[Number(config.boss.slice(5))];
  const start=window.lab.frame;
  let cloaked=false,lastMove,lastTick,used=new Set(),capture=null,guardTick=null,recovery=0,shieldUsed=false,recovered=false;
  let jumpProbe=null,jump=null;
  function hold(code,on) {
   if(on===held.has(code)) return;
   if(on) held.add(code); else held.delete(code);
   window.dispatchEvent(new KeyboardEvent(on?'keydown':'keyup',{code,bubbles:true,cancelable:true}));
  }
  function control(){
   const f=window.lab.frame,b=f.fieldBoss,a=f.actors[f.active-1];
   for(const event of Array.isArray(f.events)?f.events:[]) {
    if(event.actor===1&&event.kind==='hit'&&entities.includes(event.target)&&event.t>=start.t){
     hits.set(event.seq,event.value);
     struck.add(event.target);
    }
   }
   if(!f.coop?.code||b?.phase==='respawn'||f.returns>start.returns||f.t-start.t>105){
    for(const code of [...held]) hold(code,false);
    window.coopSumeru={seconds:+(f.t-start.t).toFixed(2),hp:a.hp,kills:f.kills-start.kills,startingMora:start.mora,
     mora:f.mora-start.mora,startingXp:start.progression.killXp,xp:f.progression.killXp-start.progression.killXp,
     moves:[...moves].sort(),manualDamage:[...hits.values()].reduce((sum,v)=>sum+v,0),cloaked,
     markers:[...markers],emerged:[...emerged],air:[...air],down:[...down],
     guardTick,recovery,shieldUsed,forms:[...forms].sort(),landings:[...landings],maskPaths:[...maskPaths],
     flightTargets:[...flightTargets],fallLayouts:[...fallLayouts],recovered,
     skullTracks:[...skullTracks],bombLayouts:[...bombLayouts],relayTracks:[...relayTracks],struck:[...struck],
     gravityTracks:[...gravityTracks],jump};
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
    const center=flight.warningCenter==='path'?(b.destinationX+b.x)/2:b.destinationX;
    visual=f.draws.some(d=>d.kind==='rect'&&d.color===flight.warning&&d.y===flight.warningY&&d.h===(flight.warningHeight??3)&&
     Math.abs(d.x+d.w/2+f.camera-center)<.001);
    if(visual) flightTargets.add(b.destinationX);
   }
   if(key==='wolflord'){
    // The ground cue is checked above. Capture one of the moving skulls.
    visual=false;
    for(const skull of Array.isArray(b.skulls)?b.skulls:[]){
     const age=b.tick-[84,120][skull.index-1];
     const dir=Math.sign(skull.x-b.x);
     const distance=(.37+age*3.5/60)*88;
     if(Math.abs(b.x+dir*distance-skull.x)<.001&&f.draws.some(d=>d.source===art&&d.h===27&&
        Math.abs(d.y-(skull.y+13))<.001&&Math.abs(d.x+f.camera-skull.x)<.001)){
      skullTracks.add([skull.index,b.x.toFixed(3),dir].join(','));
      if(age>=4) visual=true;
     }
    }
   }
   if(key==='serpent'){
    const marks=f.draws.filter(d=>d.kind==='rect'&&d.y===473&&d.h===3&&d.color==='#ed9e57');
    if(b.move==='FRS02'&&marks.some(d=>Math.abs(d.x+d.w/2+f.camera-b.emergeX)<.001)){
     if(b.underground&&!sprite) markers.add(b.emergeX);
     if(!b.underground&&b.tick>=114&&b.tick<138&&sprite&&Math.abs(sprite.x+f.camera-b.emergeX)<.001){
      emerged.add(b.emergeX);
      if(b.tick>=122) visual=true;
     }
    }
    if(b.bombPoints?.length===3&&marks.length===3&&marks.every((d,i)=>
     Math.abs(d.x+d.w/2+f.camera-b.bombPoints[i])<.001)){
     bombLayouts.add(b.bombPoints.map(x=>x.toFixed(3)).join(','));
    }
   }
   if(config.bodies&&b.relayLandings?.length===2){
    const airborne=b.bodies.findIndex(body=>body.y<440);
    if(airborne>=0&&b.bodies[1-airborne].y===480){
     const color=['#83eeff','#dcabff'][airborne];
     const cue=f.draws.find(d=>d.kind==='rect'&&d.y===473&&d.h===2&&d.color===color);
     const sprites=f.draws.filter(d=>d.source===art||
      d.source==='rimebiter-idle-source-v1.png'||d.source==='bolteater-idle-source-v1.png');
     visual=Boolean(cue)&&sprites.length===2&&b.bodies.every((body,i)=>
      Math.abs(sprites[i].x+f.camera-body.x)<.001&&sprites[i].y===body.y)&&
      Math.abs(cue.x+cue.w/2+f.camera-b.relayLandings[airborne])<.001;
     if(visual) relayTracks.add([airborne,...b.relayLandings.map(x=>x.toFixed(3))].join(','));
    }
   }
   if(config.gravityJump&&b.gravity){
    const z=b.gravity;
    const outlined=f.draws.some(d=>d.color==='#a9deeb'&&d.y===z.bottom-3&&d.h===3&&
     Math.abs(d.x+f.camera-z.left)<.001&&Math.abs(d.w-(z.right-z.left))<.001);
    if(outlined&&z.factor===.55){
     gravityTracks.add([z.left,z.right,z.top,z.bottom].map(v=>v.toFixed(3)).join(','));
     visual=a.y<285;
    }
   }
   const tell=config.fallTell;
   if(tell&&b.move===tell.move&&b.fallPoints?.length===3){
    const marks=f.draws.filter(d=>d.kind==='text'&&d.color===tell.color);
    if(marks.length===3&&marks.every((d,i)=>d.text===String(i+1)&&Math.abs(d.x+f.camera-b.fallPoints[i])<.001)){
     fallLayouts.add(b.fallPoints.map(x=>x.toFixed(3)).join(','));
     if(tell.captureAt&&b.tick>=tell.captureAt) visual=true;
    }
   }
   if(config.observeRecovery&&b.recovering&&sprite) recovered=true;
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
   const preferred=b.bodies?.[side===-1?0:1];
   const other=b.bodies?.[side===-1?1:0];
   const target=config.bodies?(preferred?.y<450?other:preferred)??b:b;
   const dx=target.x-a.x;
   let desired=target.x+side*(config.stance??104);
   const gravityTurn=config.gravityJump&&b.move==='FFG03'&&b.tick<188;
   if(gravityTurn&&side===1) desired=(b.gravity?.right??b.x+264)+26;
   if(config.gravityJump){
    const z=b.gravity;
    const inside=z&&a.x>z.left&&a.x<z.right;
    if(!jump&&!jumpProbe&&z&&a.ground&&b.tick>=90&&b.tick<125&&Boolean(inside)===(side===-1))
     jumpProbe={inside:Boolean(inside),start:a.y,min:a.y};
    if(jumpProbe){
     jumpProbe.min=Math.min(jumpProbe.min,a.y);
     if(a.y>jumpProbe.min+5){
      jump={inside:jumpProbe.inside,height:+(jumpProbe.start-jumpProbe.min).toFixed(2)};
      jumpProbe=null;
     }
    }
    hold('Space',Boolean(jumpProbe));
   }
   const position=desired-a.x,turn=Math.abs(dx)>8&&dx*a.dir<0;
   hold('KeyA',position<-7||(Math.abs(position)<=7&&turn&&dx<0));
   hold('KeyD',position>7||(Math.abs(position)<=7&&turn&&dx>0));
   const watchRelay=config.bodies&&b.hp<450&&relayTracks.size<2;
   const watchGravity=config.gravityJump&&(gravityTurn||(!jump&&b.hp<470));
   hold('KeyJ',!watchRelay&&!watchGravity&&Math.abs(dx)<125&&dx*a.dir>=0);
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
 if(config.bodies) await Promise.all(players.map(({route})=>route.walk(400)));
 for(const {page} of players) {
  const actual=await page.evaluate(async()=>{
   const {sceneryStatus,loadScenery}=await import('./scenery.js');
   await loadScenery(window.lab.frame);
   return sceneryStatus(window.lab.frame);
  });
  assert.deepEqual(actual,{key:scene,file:asset+'-background-v1.png',state:'ready'});
  if(config.bodies){
   const view=await page.evaluate(ids=>window.lab.frame.coop.enemies.filter(e=>ids.includes(e.id)),config.bodies);
   assert.deepEqual(view.map(e=>[e.id,e.hp]),config.bodies.map(id=>[id,hp]));
   await page.locator('#fieldBossHp').waitFor({state:'visible',timeout:8000});
   assert.equal(await page.locator('#fieldBoss progress:visible').count(),1);
  }
 }
 await Promise.all([fight(host,-1,key,config),fight(guest,1,key,config)]);
 try{
  await Promise.all(players.map(({page})=>page.waitForFunction(()=>window.coopSumeru,null,{timeout:130000})));
 }catch(error){
  const state=await Promise.allSettled(players.map(({page})=>page.evaluate(()=>{
   const frame=window.lab.frame;
   return {node:frame.story.node,boss:frame.fieldBoss,time:frame.t,returns:frame.returns,
    status:document.querySelector('#status')?.textContent};
  })));
  throw new Error(key+' fight did not finish: '+JSON.stringify({state,errors}),{cause:error});
 }
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
 if(key==='wolflord'){
  for(const index of [1,2])
   assert.ok(a.skullTracks.some(track=>track.startsWith(index+',')&&b.skullTracks.includes(track)),JSON.stringify(results));
 }
 if(key==='serpent'){
  assert.ok(a.markers.some(x=>b.markers.includes(x)&&a.emerged.includes(x)&&b.emerged.includes(x)),JSON.stringify(results));
  assert.ok(a.bombLayouts.some(x=>b.bombLayouts.includes(x)),JSON.stringify(results));
 }
 if(config.bodies){
  for(const index of [0,1])
   assert.ok(a.relayTracks.some(track=>track.startsWith(index+',')&&b.relayTracks.includes(track)),JSON.stringify(results));
  assert.ok(config.bodies.every(id=>a.struck.includes(id)||b.struck.includes(id)),JSON.stringify(results));
 }
 if(config.gravityJump){
  assert.ok(a.gravityTracks.some(track=>b.gravityTracks.includes(track)),JSON.stringify(results));
  assert.ok(a.jump?.inside&&b.jump?.inside===false&&b.jump.height>145&&b.jump.height<170&&
   a.jump.height>b.jump.height*1.7,JSON.stringify(results));
 }
 if(config.fallTell) assert.ok(a.fallLayouts.some(x=>b.fallLayouts.includes(x)),JSON.stringify(results));
 if(config.observeRecovery) assert.ok(a.recovered&&b.recovered,JSON.stringify(results));
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
  for(const node of new Set([config.approach,...(config.transit??[]).toReversed(),config.hub]))
   await Promise.all(players.map(({route})=>route.cross(node)));
  const rewardState=()=>host.evaluate(()=>[window.lab.frame.progression.questXp,window.lab.frame.mora]);
  const before=await rewardState();
  await players[0].route.report(quest);
  const [afterXp,afterMora]=await rewardState();
  assert.deepEqual([afterXp-before[0],afterMora-before[1]],config.report);
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
