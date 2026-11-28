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
  gravityJump:true,evade:{FFG01:[86,140],FFG02:[92,140],FFG03:[]}},
 emperor:{hub:'fontaine-hub',arena:'emperor-field-cove',approach:'fontaine-field',
  boss:'boss-26160302',quest:'emperor-commission',hp:980,mora:280,xp:98800,scene:'emperorField',
  asset:'emperor-field',pose:'poses',label:'exposed',fixture:'emperor-field',report:[5000,360],
  evade:{FEC01:[98],FEC02:[104,152],FEC03:[116]}},
 seahorse:{hub:'fontaine-hub',arena:'seahorse-field-cavern',approach:'fontaine-field',
  boss:'boss-26180101',quest:'seahorse-commission',hp:1010,mora:290,xp:113150,scene:'seahorseField',
  asset:'seahorse-field',pose:'poses',label:'pearl',fixture:'seahorse-field',report:[5200,370],
  evade:{FSH01:[92],FSH02:[98,146],FSH03:[128]}},
 suanni:{hub:'chenyu-camp',arena:'suanni-field-sanctum',approach:'chenyu-depth',
  boss:'boss-26190101',quest:'suanni-commission',hp:738,mora:196,xp:5900,scene:'suanniField',
  asset:'suanni-field',pose:'poses',label:'fall',fixture:'suanni-field',report:[2900,240],stance:84,
  flight:{move:'FSU03',height:142,offset:0,warning:'#91d6ff',warningY:476,warningHeight:2},
  evade:{FSU01:[92,164],FSU02:[101,161],FSU03:[104,188,214]}},
 legatus:{hub:'fontaine-hub',arena:'legatus-field-hall',approach:'nostoi-castle-approach',
  boss:'boss-26140101',quest:'legatus-commission',hp:1010,mora:335,xp:191700,scene:'legatusField',
  asset:'legatus-field',pose:'poses',label:'resonator',fixture:'legatus-field',report:[6200,420],
  breakable:{form:'resonating',color:'#ffb464',y:415},evade:{FLG01:[95],FLG02:[111,136],FLG03:[162]}},
 qucusaur:{hub:'natlan-hub',arena:'qucusaur-field-cavern',approach:'natlan-field',
  boss:'boss-26230301',quest:'qucusaur-commission',hp:1020,mora:360,xp:212400,scene:'qucusaurField',
  asset:'qucusaur-field',pose:'poses',label:'feather',fixture:'qucusaur-field',report:[7200,460],
  breakable:{form:'gold',color:'#ffb456',y:414},evade:{FQT01:[92],FQT02:[99,158],FQT03:[216,296]}},
 yumka:{hub:'natlan-hub',arena:'yumka-field-ravine',approach:'natlan-field',
  boss:'boss-26220301',quest:'yumka-commission',hp:1035,mora:370,xp:212400,scene:'yumkaField',
  asset:'yumka-field',pose:'poses',label:'fruits',fixture:'yumka-field',report:[7400,470],
  flight:{move:'FYM02',height:154,offset:0,warning:'#d0ed89',warningY:476,warningHeight:2,capture:false},
  evade:{FYM01:[104],FYM02:[116],FYM03:[122,176]}},
 'config-device':{hub:'natlan-hub',arena:'config-device-field-workshop',approach:'natlan-field',
  boss:'boss-24090201',quest:'config-device-commission',hp:1020,mora:380,xp:240900,scene:'configDeviceField',
  asset:'config-device-field',pose:'poses',label:'collector',fixture:'config-device-field',report:[7600,480],
  breakable:{form:'hover',color:'#ffb44d',y:375,pips:true},evade:{FSC01:[98,158],FSC02:[104,164],FSC03:[320]}},
 papilla:{hub:'natlan-hub',arena:'papilla-field-hollow',approach:'natlan-field',
  boss:'boss-22120101',quest:'papilla-commission',hp:1050,mora:395,xp:273250,scene:'papillaField',
  asset:'papilla-field',pose:'poses',label:'morph',fixture:'papilla-field',report:[7800,500],
  evade:{FMP01:[128],FMP02:[122,182],FMP03:[128]}},
 'lava-dragon':{hub:'natlan-hub',arena:'atocpan-lava-field',approach:'natlan-field',
  boss:'boss-26270301',quest:'lava-dragon-commission',hp:1100,mora:410,xp:309900,scene:'lavaDragonField',
  asset:'lava-dragon-field',pose:'poses',label:'eruption',fixture:'lava-dragon-field',report:[8000,520],stance:87,
  evade:{FLD01:[104],FLD02:[104,170],FLD03:[106,124],FLD04:[122,188]}},
 overseer:{hub:'natlan-hub',transit:['natlan-field'],arena:'atocpan-overseer-ruin',approach:'atocpan-lava-field',
  boss:'boss-24090501',quest:'overseer-commission',hp:1125,mora:420,xp:351500,scene:'overseerField',
  asset:'overseer-field',pose:'poses',label:'cooled',fixture:'overseer-field',report:[8200,540],stance:87,
  evade:{FOV01:[104,175,246],FOV02:[107,132],FOV03:[156,242,328]}},
 spiritspeaker:{hub:'natlan-hub',transit:['natlan-quarry-road'],arena:'spiritspeaker-field-grotto',approach:'natlan-field',
  boss:'boss-25520101',quest:'spiritspeaker-commission',hp:1060,mora:420,xp:398700,scene:'spiritspeakerField',
  asset:'spiritspeaker-field',pose:'poses',label:'echoes',fixture:'spiritspeaker-field',report:[8600,560],stance:74,
  evade:{FSP01:[99,168],FSP02:[107,180],FSP03:[139,211]}},
 duckle:{hub:'nod-town',arena:'nod-duckle-workyard',approach:'nod-field',
  boss:'boss-24100101',quest:'knuckle-duckle-commission',hp:1135,mora:445,xp:526400,scene:'duckleField',
  asset:'knuckle-duckle-field',pose:'poses',label:'repair-march',fixture:'knuckle-duckle-field',report:[8500,570],stance:76,
  evade:{FDK01:[97,165],FDK02:[124],FDK03:[336]}},
 battleship:{hub:'nod-town',arena:'nod-battleship-depot',approach:'nod-field',
  boss:'boss-23090101',quest:'battleship-commission',hp:1170,mora:455,xp:597050,scene:'battleshipField',
  asset:'battleship-field',pose:'poses',label:'cooling-plate',fixture:'battleship-field',report:[8800,590],stance:77,
  evade:{FBT01:[109],FBT02:[111,179],FBT03:[319]}},
 // The level 144 fixture earns 65% of the boss's base EXP.
 herra:{hub:'nod-town',arena:'nod-herra-terrace',approach:'nod-field',
  boss:'boss-20081001',quest:'frostnight-herra-commission',hp:1200,mora:465,xp:440148,scene:'herraField',
  asset:'frostnight-herra-field',pose:'poses',label:'twin-waves',fixture:'frostnight-herra-field',report:[9000,610],stance:76,
  evade:{FHR01:[103,169],FHR02:[127],FHR03:[179,267]}},
 nightmare:{hub:'nod-town',arena:'nod-nightmare-shore',approach:'nod-field',
  boss:'boss-22150101',quest:'whisperer-nightmares-commission',hp:1340,mora:475,xp:768050,scene:'nightmareField',
  asset:'whisperer-nightmares-field',pose:'poses',label:'two-fishers',fixture:'whisperer-nightmares-field',report:[9200,630],stance:76,
  evade:{FWN01:[95],FWN02:[139],FWN03:[151,223,319]}},
 moonfly:{hub:'nod-town',arena:'nod-moonfly-hollow',approach:'nod-field',
  boss:'boss-26301101',quest:'moonfly-commission',hp:1050,mora:485,xp:871150,scene:'moonflyField',
  asset:'moonfly-field',pose:'poses',label:'cocoons',report:[9400,650],stance:82,
  evade:{FMF01:[95,161],FMF02:[107,175],FMF03:[209,317,445]}},
 moongecko:{hub:'nod-town',arena:'nod-gecko-depths',approach:'nod-field',
  boss:'boss-26302101',quest:'moongecko-commission',hp:1160,mora:495,xp:988100,scene:'moongeckoField',
  asset:'moongecko-field',pose:'poses',label:'moonstone-anchor',report:[9600,670],stance:78,
  evade:{FMG01:[99,169],FMG02:[129],FMG03:[475]}},
 vigil:{hub:'dornman-camp',arena:'windrest-vigil-court',approach:'dornman-camp',
  boss:'boss-24111101',quest:'fallen-vigil-commission',hp:700,mora:155,xp:1250,scene:'vigilField',
  asset:'fallen-vigil-field',pose:'poses',label:'elemental-stars',fixture:'fallen-vigil-field',report:[1400,220],stance:70,
  evade:{FV01:[99,169],FV02:[107,173],FV03:[925,1005]}},
 flugel:{hub:'snezhnaya-hub',arena:'flugel-tundra-basin',approach:'snezhnaya-field',
  boss:'boss-26310501',quest:'flugel-commission',hp:1180,mora:540,xp:1466100,scene:'flugelField',
  asset:'flugel-field',pose:'poses',label:'wind-orbs',fixture:'flugel-field',report:[10400,710],stance:78,
  evade:{FL01:[99,169],FL02:[129,203],FL03:[171,247,323,485]}},
 'drifting-snow':{hub:'snezhnaya-hub',arena:'drifting-snow-court',approach:'snezhnaya-field',
  boss:'boss-25135202',quest:'drifting-snow-commission',hp:1200,mora:560,xp:1868400,scene:'driftingSnowField',
  asset:'drifting-snow-field',pose:'poses',label:'ice-coffin',fixture:'drifting-snow-field',report:[10800,730],stance:76,
  sharedGuard:{view:'driftingSnow',value:'layers',readyMove:'FDS02',move:'FDS03'},
  evade:{FDS01:[99,169],FDS02:[123,203],FDS03:[177,287,457,529]}},
 'immortal-construct':{hub:'snezhnaya-hub',arena:'immortal-construct-root-hollow',approach:'snezhnaya-field',
  boss:'boss-25140101',quest:'immortal-construct-commission',hp:1260,mora:550,xp:1298650,scene:'immortalConstructField',
  asset:'immortal-construct-field',pose:'poses',label:'resurrection-guard',fixture:'immortal-construct-field',report:[10600,720],stance:76,
  sharedGuard:{view:'immortalConstruct',value:'units',readyMove:'IC02',move:'IC03'},
  evade:{IC01:[99,169],IC02:[123,203],IC03:[135,215,295]}},
 wavebinder:{hub:'novokichev-camp',arena:'wavebinder-tide-cavern',approach:'novokichev-depth',
  boss:'boss-25134601',quest:'wavebinder-commission',hp:1160,mora:570,xp:2381150,scene:'wavebinderField',
  asset:'wavebinder-field',pose:'poses',label:'valiant-anchor',fixture:'wavebinder-field',fixtureCompanion:'ayaka',report:[11200,750],stance:76,
  evade:{WB01:[99,169,239],WB02:[121,199],WB03:[]}}
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
 if(accepted&&!save.story.quests[quest]) await route.accept(quest);
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
  const gravityTracks=new Set(),fireLayouts=new Set(),exposedAt=new Set(),pearls=new Set(),interruptedAt=new Set();
  const sharedObjects=new Set(),diveLayouts=new Set(),cannonLayouts=new Set();
  const heatStates=new Set(),eruptionLayouts=new Set(),purgeLayouts=new Set(),cooledFlows=new Set();
  const echoLayouts=new Set();
  const repairLayouts=new Set(),coolingLayouts=new Set(),coolingLayers=new Set();
  const herraLanes=new Set(),herraWaveMarks=new Set(),fisherLayouts=new Set(),fisherCounts=new Set();
  const anchorLayers=new Set();
  const hasCocoon=key==='moonfly'||key==='moongecko';
  const wavebinder=key==='wavebinder';
  const jumpEvade=hasCocoon||key==='vigil'||key==='flugel'||wavebinder||config.sharedGuard;
  const drinkLevels=new Set(),valiantLevels=new Set();
  let drinkDown=false,valiantAnchor=false,valiantDown=false,waveRageAt,lastWaveFire=-Infinity;
  const starLayouts=new Set(),orbLayouts=new Set();
  const guardAmounts=new Set();
  const art=config.pose&&config.asset+'-'+config.pose+'-source-v1.png';
  const entities=config.bodies??[Number(config.boss.slice(5))];
  const start=window.lab.frame;
  let cloaked=false,lastMove,lastTick,used=new Set(),capture=null,guardTick=null,recovery=0,shieldUsed=false,recovered=false;
  let jumpProbe=null,jump=null,lastHp=Infinity,hpMonotonic=true;
  let lavaStage='rock',lastHeatAction=-Infinity,hotAt=null,coolingTime=null;
  let echoRecovery=false;
  let machineDown=false;
  let herraRecovery=false,fisherInterrupted=false,lastFisherSkill=-Infinity;
  let caught=false,escaped=false,peerEscaped=false,peerStillBound=false,anchorBroken=false,geoExposure=false,healX,nextHeal=0;
  let vigilDown=false,lastRecord=-Infinity,lionReady=false,wardDown=false,orbsDown=false,lastLionFire=-Infinity;
  let guardReady=false,guardDown=false,chantSeen=false,paidHp=0,lastGuardFire=-Infinity;
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
     gravityTracks:[...gravityTracks],jump,fireLayouts:[...fireLayouts],exposedAt:[...exposedAt],
     pearls:[...pearls],interruptedAt:[...interruptedAt],sharedObjects:[...sharedObjects],diveLayouts:[...diveLayouts],
     cannonLayouts:[...cannonLayouts],hpMonotonic,heatStates:[...heatStates],eruptionLayouts:[...eruptionLayouts],
     coolingTime,purgeLayouts:[...purgeLayouts],cooledFlows:[...cooledFlows],
     echoLayouts:[...echoLayouts],echoRecovery,
     repairLayouts:[...repairLayouts],coolingLayouts:[...coolingLayouts],coolingLayers:[...coolingLayers],machineDown,
     ...(key==='herra'?{herraLanes:[...herraLanes],herraWaveMarks:[...herraWaveMarks],herraRecovery}:{}),
     ...(key==='nightmare'?{fisherLayouts:[...fisherLayouts],fisherCounts:[...fisherCounts],fisherInterrupted}:{}),
     ...(hasCocoon?{caught,escaped,peerStillBound,anchorLayers:[...anchorLayers],anchorBroken,geoExposure}:{}),
     ...(key==='vigil'?{starLayouts:[...starLayouts],vigilDown}:{}),
     ...(key==='flugel'?{orbLayouts:[...orbLayouts],wardDown,orbsDown}:{}),
     ...(config.sharedGuard?{guardAmounts:[...guardAmounts],guardDown,chantSeen,paidHp}:{}),
     ...(wavebinder?{drinkLevels:[...drinkLevels],valiantLevels:[...valiantLevels],drinkDown,valiantAnchor,valiantDown}:{})};
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
   hpMonotonic=hpMonotonic&&b.hp<=lastHp;
   lastHp=b.hp;
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
    if(visual){
     flightTargets.add(b.destinationX);
     if(flight.capture===false) visual=false;
    }
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
   if(key==='emperor'){
    if(b.firePoints?.length===2&&b.tick<108){
     const marks=f.draws.filter(d=>d.color==='#ffad66'&&d.y===476&&d.h===2);
     if(marks.length===2&&marks.every((d,i)=>Math.abs(d.x+d.w/2+f.camera-b.firePoints[i])<.001))
      fireLayouts.add(b.firePoints.map(x=>x.toFixed(3)).join(','));
    }
    if(b.form==='exposed'&&sprite?.h===91){exposedAt.add(b.x);visual=true}
   }
   if(key==='seahorse'){
    const pearl=b.weakpoint;
    if(pearl?.required===2&&b.form==='charging'&&f.draws.some(d=>(d.color==='#b9cdfc'||d.color==='#f6edff')&&
       d.w===6&&d.h===3&&d.y===pearl.y-13&&Math.abs(d.x+f.camera-pearl.x)<8)){
     pearls.add([pearl.x.toFixed(3),pearl.y.toFixed(3)].join(','));
     visual=true;
    }
    if(b.form==='dim'&&b.label==='真珠が消灯・反撃'&&!b.flying&&b.destinationX===undefined&&sprite)
     interruptedAt.add(b.x);
   }
   if(config.breakable){
    const device=b.summon;
    const {form,color,y,pips}=config.breakable;
    const deviceMarks=device?f.draws.filter(d=>d.y===y&&Math.abs(d.x+f.camera-device.x)<24):[];
    const bar=pips?deviceMarks.filter(d=>d.w===11&&d.h===4&&d.color===color).length===device?.hp:
     deviceMarks.some(d=>d.h===5&&d.color===color&&Math.abs(d.x+17+f.camera-device.x)<.001&&
      Math.abs(d.w-34*device.hp/device.maxhp)<.001);
    if(device&&b.form===form&&bar){
     sharedObjects.add([device.x.toFixed(3),device.maxhp].join(','));
     visual=true;
    }
    const interrupted=pips?b.form==='down':key==='legatus'?
     b.form==='staggered'&&b.label==='共鳴が止まる・反撃':b.flightInterrupted;
    if(!device&&interrupted&&sprite) interruptedAt.add(b.x);
    if(pips&&b.cannonBounds&&b.tick<324){
     const {left,right}=b.cannonBounds;
     const edges=f.draws.filter(d=>d.color===color&&d.w===2&&d.h>100);
     if([left,right-2].every(x=>edges.some(d=>Math.abs(d.x+f.camera-x)<.001)))
      cannonLayouts.add([left,right].map(x=>x.toFixed(3)).join(','));
    }
   }
   if(key==='qucusaur'&&b.divePoints?.length===2&&b.tick<186){
    const marks=f.draws.filter(d=>d.kind==='text'&&d.color==='#ffebbc'&&(d.text==='1'||d.text==='2'));
    if(marks.length===2&&marks.every((d,i)=>Math.abs(d.x+f.camera-b.divePoints[i])<.001))
     diveLayouts.add(b.divePoints.map(x=>x.toFixed(3)).join(','));
   }
   if(key==='yumka'&&b.firePoints?.length===2&&b.tick<126){
    const marks=f.draws.filter(d=>d.kind==='text'&&d.color==='#fff0c3'&&(d.text==='1'||d.text==='2'));
    if(marks.length===2&&marks.every((d,i)=>Math.abs(d.x+f.camera-b.firePoints[i])<.001)){
     fireLayouts.add(b.firePoints.map(x=>x.toFixed(3)).join(','));
     visual=b.tick>=96&&f.draws.filter(d=>d.source===art).length===2;
    }
   }
   if(key==='papilla'&&sprite){
    if(b.form==='stem'&&b.pose?.startsWith('stem-')) forms.add('stem');
    if(b.form==='wing'&&b.pose?.startsWith('wing-')) forms.add('wing');
    if(b.flying&&b.y<421&&b.pose==='fungus-ready'&&sprite.y===b.y&&Math.abs(sprite.x+f.camera-b.x)<.001){
     const start=b.destinationX-.7*88;
     visual=f.draws.some(d=>d.color==='#bd96ff'&&d.y===477&&d.w===6&&d.h===2&&
      Math.abs(d.x+f.camera-start)<.001);
     if(visual){forms.add('fungus');flightTargets.add(b.destinationX)}
    }
   }
   if(key==='lava-dragon'&&b.lavaHeat){
    heatStates.add([b.form,b.lavaHeat.level].join(','));
    if(b.eruptionPoints?.length===2&&b.tick<144){
     const marks=f.draws.filter(d=>d.kind==='text'&&d.color==='#fff1be'&&['1 / 2','2 / 2'].includes(d.text));
     if(marks.length===2&&marks.every((d,i)=>Math.abs(d.x+f.camera-b.eruptionPoints[i])<.001)){
      eruptionLayouts.add(b.eruptionPoints.map(x=>x.toFixed(3)).join(','));
      visual=b.tick>=119;
     }
    }
   }
   if(key==='overseer'&&b.purgePoints?.length===3){
    const mark=f.draws.find(d=>d.kind==='text'&&d.color==='#ebfcff'&&/^[123] \/ 3$/.test(d.text));
    if(mark&&Math.abs(mark.x+f.camera-b.purgePoints[Number(mark.text[0])-1])<.001){
     const layout=b.purgePoints.map(x=>x.toFixed(3)).join(',');
     purgeLayouts.add(layout);
     if(b.form==='cooled'&&b.tick>=332&&b.tick<346&&f.draws.filter(d=>d.source===art).length===2){
      cooledFlows.add([layout,b.flow.level].join(','));
      visual=true;
     }
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
   if(key==='spiritspeaker'){
    if(b.echoesVisible&&!b.underground&&!b.summons){
     const sprites=f.draws.filter(d=>d.source===art);
     if(sprites.length===3&&sprites[2].opacity===undefined&&Math.abs(sprites[2].x+f.camera-b.x)<.001&&
        sprites.slice(0,2).every((d,i)=>d.opacity>0&&d.opacity<1&&
         Math.abs(d.x+f.camera-(b.echoLanes[i].left+b.echoLanes[i].right)/2)<.001)){
      echoLayouts.add(b.echoLanes.map(({left,right})=>[left,right].map(x=>x.toFixed(3)).join(':')).join(','));
      visual=b.tick>=126&&b.tick<144;
     }
    }
    if(b.move==='FSP03'&&b.recoveryTicks>0&&sprite&&!b.echoLanes) echoRecovery=true;
   }
   if(key==='duckle'){
    const sprites=f.draws.filter(d=>d.source===art);
    if(b.repairSequence&&!b.repairWard&&b.summons?.length===2&&sprites.length===3&&
       (b.summons[0].x-b.x)*(b.summons[1].x-b.x)>0&&
       sprites.slice(1).every((d,i)=>Math.abs(d.x+f.camera-b.summons[i].x)<.001)){
     repairLayouts.add(b.summons.map(unit=>unit.id).join(','));
     visual=true;
    }
    if(b.form==='down'&&b.repairSequence?.interrupted&&b.repairSequence.defeated===2&&!b.summons) machineDown=true;
   }
   if(key==='battleship'){
    const plate=b.coolingPlate;
    if(plate&&!b.thermal&&sprite&&f.draws.some(d=>d.color==='#17384dcf'&&Math.abs(d.x+f.camera-plate.left)<.001)){
     coolingLayouts.add([plate.left,plate.right,plate.top,plate.bottom].map(x=>x.toFixed(3)).join(':'));
     coolingLayers.add(plate.layers);
     visual=true;
    }
    if(b.form==='down'&&b.coolingInterrupted&&!plate&&b.recoveryTicks>0&&sprite) machineDown=true;
   }
   if(key==='herra'){
    if(b.form==='shadow'&&b.lockedWave&&!b.gloom&&sprite){
     const {left,right}=b.lockedWave;
     const mark=f.draws.find(d=>d.kind==='text'&&d.y===500&&['1','2'].includes(d.text)&&
      Math.abs(d.x+f.camera-(left+right)/2)<.001);
     if(mark){
      herraLanes.add([left,right].map(x=>x.toFixed(3)).join(':'));
      herraWaveMarks.add(mark.text);
      visual=b.tick>=184&&b.tick<198;
     }
    }
    if(b.move==='FHR03'&&b.form==='recover'&&b.recoveryTicks>0&&sprite) herraRecovery=true;
   }
   if(key==='nightmare'){
    if(b.fisherSequence&&!b.darkShield){
     fisherCounts.add(b.fisherSequence.defeated);
     const sprites=f.draws.filter(d=>d.source===art);
     if(b.summons?.length===2&&sprites.length===3&&sprites.slice(1).every((d,i)=>
       Math.abs(d.x+f.camera-b.summons[i].x)<.001)){
      fisherLayouts.add(b.summons.map(unit=>unit.x.toFixed(3)).join(','));
      visual=true;
     }
    }
    if(b.form==='down'&&b.fisherSequence?.interrupted&&b.fisherSequence.defeated===2&&!b.summons) fisherInterrupted=true;
   }
   const mark=hasCocoon&&f.radiantCocoons?.find(m=>m.actor===f.active);
   const peer=hasCocoon&&f.coop.peers[0]?.actors[0];
   const peerTag=peer&&f.draws.find(d=>(d.text==='集光の繭'||d.text==='脱出')&&
    Math.abs(d.x+f.camera-peer.x)<.001&&Math.abs(d.y-(peer.y-65))<.001);
   if(hasCocoon){
    if(peerTag?.text==='脱出') peerEscaped=true;
    if(mark?.bound) caught=true;
    if(mark&&!mark.bound){
     escaped=true;
     if(peerTag?.text==='集光の繭') peerStillBound=true;
    }
    if(key==='moonfly') visual=Boolean(mark?.bound&&peerTag?.text==='集光の繭');
    if(b.summon&&f.draws.some(d=>d.source===art&&Math.abs(d.x+f.camera-b.summon.x)<.001)){
     anchorLayers.add(b.summon.hp);
     visual=Boolean(mark?.bound);
    }
    if(key==='moongecko'&&b.form==='down'&&!b.summon) anchorBroken=true;
    if(b.geoExposureTicks>0) geoExposure=true;
    if(mark?.bound&&(key==='moonfly'||anchorBroken)&&
       (side===-1||peerEscaped)) healX??=b.x+side*295;
   }
   if(key==='vigil'){
    if(b.summons?.length===2&&b.vigil.records.every(e=>e==='pyro')&&
       f.draws.filter(d=>d.source===art).length===3){
     starLayouts.add(b.summons.map(u=>`${u.x.toFixed(2)}:${u.element}:${u.maxhp}`).join(','));
     visual=true;
    }
    if(b.move==='FV03'&&b.tick>=402&&f.active===2) window.lab.action('swap');
    if(b.form==='down'&&!b.summons) vigilDown=true;
   }
   if(key==='flugel'){
    if(b.move==='FL01'&&b.tick>=125) lionReady=true;
    if(b.flugel.downReason==='ward'&&b.form==='down') wardDown=true;
    if(b.flugel.downReason==='orbs'&&b.form==='down'&&!b.summons) orbsDown=true;
    if(b.flugel.mode==='anemo'&&b.summons?.length===5){
     const sprites=f.draws.filter(d=>d.source===art).slice(1);
     if(sprites.length===5&&sprites.every((d,i)=>Math.abs(d.x+f.camera-b.summons[i].x)<.001)){
      orbLayouts.add(b.summons.map(u=>u.id).join(','));
      visual=true;
     }
    }
   }
   const guard=config.sharedGuard;
   const guardState=guard&&b[guard.view];
   const guardAmount=guardState?guardState[guard.value]:0;
   if(guardState){
    if(b.move===guard.readyMove&&b.tick>=225) guardReady=true;
    if(guardAmount>0&&sprite){
     guardAmounts.add(guardAmount);
     visual=true;
    }
    if(guardState.chantStart) chantSeen=true;
    if(guardState.spent) paidHp=guardState.spent;
    if(b.form==='down'&&guardAmount===0&&guardAmounts.size) guardDown=true;
   }
   const wave=b.wavebinder;
   if(wave){
    if(wave.drinkOpen&&wave.courage>0) drinkLevels.add(wave.courage);
    if(wave.downReason==='drink') drinkDown=true;
    if(wave.valiant){
     waveRageAt=f.t-wave.rageAge/60;
     valiantLevels.add(wave.courage);
     if(b.move==='WB02'&&b.tick>=84&&b.tick<174&&f.draws.filter(d=>d.source===art).length===2){
      valiantAnchor=true;
      visual=true;
     }
    }
    if(wave.downReason==='valiant'&&valiantAnchor&&f.t-waveRageAt<11.8) valiantDown=true;
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
   const healing=mark?.bound&&!escaped&&healX!==undefined;
   const attackTimings=guardState?.chantStart?[guardState.chantStart+151]:config.evade[b.move]||[];
   if(jumpEvade) hold('Space',!healing&&attackTimings.some(at=>b.tick>=at-15&&b.tick<at+6));
   for(const at of prepareShield||jumpEvade?[]:attackTimings) {
    if(b.tick>=at&&b.tick<at+6&&!used.has(at)){
     used.add(at);hold('ShiftLeft',true);hold('ShiftLeft',false);
    }
   }
   const preferred=b.bodies?.[side===-1?0:1];
   const other=b.bodies?.[side===-1?1:0];
   const device=config.breakable&&b.summon&&(!config.breakable.pips||b.cannonBounds);
   const sharedSummon=key==='moongecko'?b.summon:
    (key==='duckle'||key==='nightmare'||key==='vigil'||key==='flugel')&&
     b.summons?.at(side===-1?0:-1);
   const plate=key==='battleship'&&b.coolingPlate;
   const target=device||sharedSummon||(plate?{x:(plate.left+plate.right)/2}:
    config.bodies?(preferred?.y<450?other:preferred)??b:b);
   const dx=target.x-a.x;
   let desired=target.x+side*(device?65:config.stance??104);
   if(healing) desired=healX;
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
   const position=desired-a.x,turn=!healing&&Math.abs(dx)>8&&dx*a.dir<0;
   hold('KeyA',position<-7||(Math.abs(position)<=7&&turn&&dx<0));
   hold('KeyD',position>7||(Math.abs(position)<=7&&turn&&dx>0));
   const inReach=Math.abs(dx)<125&&dx*a.dir>=0;
   if(key==='nightmare'&&sharedSummon&&b.tick>=103&&inReach&&a.ground&&!f.macro&&f.t-lastFisherSkill>3.2){
    window.lab.action('slot1');lastFisherSkill=f.t;
   }
   if(key==='vigil'&&f.active===2&&b.vigil?.monitor&&!b.vigil.recorded&&inReach&&a.lock<=0&&f.t-lastRecord>.8){
    const skill=b.vigil.monitor===1?'skill1':'skill2';
    if((a.cd[skill]??0)===0){window.lab.action(skill);lastRecord=f.t}
   }
   if(key==='flugel'&&lionReady&&(sharedSummon||b.flugel.ward>0&&!wardDown)&&inReach&&
      a.ground&&!f.macro&&f.t-lastLionFire>3.2){
    window.lab.action('slot1');lastLionFire=f.t;
   }
   if(guardAmount>0&&b.tick>=84&&inReach&&a.ground&&!f.macro&&f.t-lastGuardFire>3.2){
    window.lab.action('slot1');lastGuardFire=f.t;
   }
   const breakDrink=wave?.drinkOpen&&!wave.drinkInterrupts&&b.tick>=116;
   const breakValiant=wave?.valiant&&valiantAnchor&&b.move==='WB02'&&b.tick>=97;
   if((breakDrink||breakValiant||valiantDown)&&inReach&&!f.macro&&f.t-lastWaveFire>3.2){
    window.lab.action('slot1');lastWaveFire=f.t;
   }
   if(healing&&Math.abs(position)<15&&a.ground&&!f.macro&&f.t>=nextHeal){
    window.lab.action('slot1');nextHeal=f.t+10;
   }
   if(key==='lava-dragon'&&b.lavaHeat){
    if(lavaStage==='rock'&&b.move==='FLD02'&&b.tick>=215) lavaStage='heatRock';
    if(lavaStage==='heatRock'&&b.form==='molten') lavaStage='molten';
    if(lavaStage==='molten'&&b.move==='FLD04'&&b.tick>=233) lavaStage='heatMolten';
    if(lavaStage==='heatMolten'&&b.form==='overburn'){lavaStage='hot';hotAt=f.t}
    if(lavaStage==='hot'&&b.form==='rock'){lavaStage='finish';coolingTime=+(f.t-hotAt).toFixed(2)}
    const heating=lavaStage==='heatRock'||lavaStage==='heatMolten';
    const heatSide=b.lavaHeat.level%2===0?-1:1;
    if(inReach&&a.ground&&!f.macro&&f.t-lastHeatAction>.35){
     if(heating&&side===heatSide){window.lab.action('slot1');lastHeatAction=f.t}
     if(lavaStage==='hot'&&side===1&&b.lavaHeat.overburnTicks<=154){window.lab.action('slot2');lastHeatAction=f.t}
    }
   }
   if(key==='overseer'&&side===-1&&b.move==='FOV03'&&b.tick>=302&&b.tick<322&&inReach&&!used.has('cool')){
    window.lab.action('slot1');used.add('cool');
   }
   const watchRelay=config.bodies&&b.hp<450&&relayTracks.size<2;
   const watchGravity=config.gravityJump&&(gravityTurn||(!jump&&b.hp<470));
   const watchEmperor=key==='emperor'&&b.hp<420&&exposedAt.size===0;
   const watchPearl=key==='seahorse'&&((b.hp<430&&!b.weakpoint&&interruptedAt.size===0)||
    (side===1&&b.weakpoint?.hits===0&&b.tick<68));
   const watchSuanni=key==='suanni'&&b.hp<410&&flightTargets.size===0;
   const watchBreak=config.breakable&&b.hp<420&&!device&&interruptedAt.size===0;
   const watchYumka=key==='yumka'&&b.hp<420&&fireLayouts.size===0;
   const watchPapilla=key==='papilla'&&b.hp<420&&flightTargets.size===0;
   const watchLava=key==='lava-dragon'&&b.hp<650&&lavaStage!=='finish';
   const watchOverseer=key==='overseer'&&b.hp<520&&cooledFlows.size===0;
   const watchEchoes=key==='spiritspeaker'&&!echoRecovery&&b.hp<520;
   const watchDuck=key==='duckle'&&!machineDown&&!sharedSummon&&b.hp<570;
   const watchShip=key==='battleship'&&!machineDown&&(plate?b.tick<105:b.hp<570);
   const watchHerra=key==='herra'&&!herraRecovery&&b.hp<680;
   const watchNightmare=key==='nightmare'&&!fisherInterrupted&&(sharedSummon?b.tick<103:b.hp<640);
   const watchCocoon=hasCocoon&&!sharedSummon&&(!escaped||!peerEscaped);
   const watchVigil=key==='vigil'&&!vigilDown&&!sharedSummon;
   const watchLion=key==='flugel'&&!sharedSummon&&(!lionReady||!orbsDown&&b.hp<620);
   const watchGuard=guard&&(!guardReady||b.move===guard.move&&b.tick<84||!guardDown&&guardAmount===0&&b.hp<500);
   const watchWave=wave&&!valiantDown&&!(breakDrink&&b.tick>=160);
   hold('KeyJ',!watchWave&&!watchRelay&&!watchGravity&&!watchEmperor&&!watchPearl&&!watchSuanni&&!watchBreak&&!watchYumka&&!watchPapilla&&
    !watchLava&&!watchOverseer&&!watchEchoes&&!watchDuck&&!watchShip&&!watchHerra&&!watchNightmare&&
    !watchCocoon&&!watchVigil&&!watchLion&&!watchGuard&&!healing&&inReach&&(!device||Math.abs(dx)<96));
   requestAnimationFrame(control);
  }
  requestAnimationFrame(control);
 },{side,key,config});
}

async function run(key,config) {
 const {arena,boss,quest,hp,mora,xp,asset,scene,label}=config;
 const fixture=JSON.parse(await fs.readFile('work/'+(config.fixture??'coop-'+key)+'-fixture.json','utf8'));
 if(config.fixtureCompanion) fixture.companion=config.fixtureCompanion;
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
 if(key==='vigil'){
  await host.evaluate(()=>window.lab.action('swap'));
  await host.waitForFunction(()=>window.lab.frame.active===2);
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
 if(key==='emperor'){
  assert.ok(a.fireLayouts.some(layout=>b.fireLayouts.includes(layout)),JSON.stringify(results));
  assert.ok(a.exposedAt.some(x=>b.exposedAt.includes(x)),JSON.stringify(results));
 }
 if(key==='seahorse'){
  assert.ok(a.pearls.some(point=>b.pearls.includes(point)),JSON.stringify(results));
  assert.ok(a.interruptedAt.some(x=>b.interruptedAt.includes(x)),JSON.stringify(results));
 }
 if(config.breakable){
  assert.ok(a.sharedObjects.some(point=>b.sharedObjects.includes(point)),JSON.stringify(results));
  assert.ok(a.interruptedAt.some(x=>b.interruptedAt.includes(x)),JSON.stringify(results));
 }
 if(key==='qucusaur') assert.ok(a.diveLayouts.some(layout=>b.diveLayouts.includes(layout)),JSON.stringify(results));
 if(key==='yumka') assert.ok(a.fireLayouts.some(layout=>b.fireLayouts.includes(layout)),JSON.stringify(results));
 if(key==='config-device') assert.ok(a.cannonLayouts.some(layout=>b.cannonLayouts.includes(layout)),JSON.stringify(results));
 if(key==='papilla'){
  for(const r of results) assert.ok(r.hpMonotonic&&r.forms.join(',')==='fungus,stem,wing',JSON.stringify(results));
  assert.ok(a.flightTargets.some(point=>b.flightTargets.includes(point)),JSON.stringify(results));
 }
 if(key==='lava-dragon'){
  for(const r of results) assert.ok(['rock,0','molten,2','overburn,4'].every(state=>r.heatStates.includes(state))&&
   r.coolingTime>0&&r.coolingTime<2.9,JSON.stringify(results));
  assert.ok(a.eruptionLayouts.some(layout=>b.eruptionLayouts.includes(layout)),JSON.stringify(results));
 }
 if(key==='overseer'){
  assert.ok(a.purgeLayouts.some(layout=>b.purgeLayouts.includes(layout)),JSON.stringify(results));
  assert.ok(a.cooledFlows.some(flow=>b.cooledFlows.includes(flow)),JSON.stringify(results));
 }
 if(key==='spiritspeaker'){
  assert.ok(a.echoLayouts.some(layout=>b.echoLayouts.includes(layout)),JSON.stringify(results));
  assert.ok(a.echoRecovery&&b.echoRecovery,JSON.stringify(results));
 }
 if(key==='duckle'){
  assert.ok(a.repairLayouts.some(layout=>b.repairLayouts.includes(layout)),JSON.stringify(results));
  assert.ok(a.machineDown&&b.machineDown,JSON.stringify(results));
 }
 if(key==='battleship'){
  assert.ok(a.coolingLayouts.some(layout=>b.coolingLayouts.includes(layout)),JSON.stringify(results));
  assert.ok(a.machineDown&&b.machineDown,JSON.stringify(results));
 }
 if(key==='herra'){
  assert.ok(a.herraLanes.some(lane=>b.herraLanes.includes(lane)),JSON.stringify(results));
  assert.ok(results.every(result=>result.herraRecovery&&['1','2'].every(number=>result.herraWaveMarks.includes(number))),
   JSON.stringify(results));
 }
 if(key==='nightmare'){
  assert.ok(a.fisherLayouts.some(layout=>b.fisherLayouts.includes(layout)),JSON.stringify(results));
  assert.ok(a.fisherInterrupted&&b.fisherInterrupted,JSON.stringify(results));
 }
 if(key==='moonfly'||key==='moongecko'){
  assert.ok(a.peerStillBound&&results.every(result=>result.caught&&result.escaped),JSON.stringify(results));
 }
 if(key==='moongecko'){
  assert.ok(a.anchorLayers.some(layers=>b.anchorLayers.includes(layers)),JSON.stringify(results));
  assert.ok(results.every(result=>result.anchorBroken&&result.geoExposure),JSON.stringify(results));
 }
 if(key==='vigil'){
  assert.ok(a.starLayouts.some(layout=>b.starLayouts.includes(layout)),JSON.stringify(results));
  assert.ok(a.vigilDown&&b.vigilDown,JSON.stringify(results));
 }
 if(key==='flugel'){
  assert.ok(a.orbLayouts.some(layout=>b.orbLayouts.includes(layout)),JSON.stringify(results));
  assert.ok(results.every(result=>result.wardDown&&result.orbsDown),JSON.stringify(results));
 }
 if(config.sharedGuard){
  assert.ok(a.guardAmounts.some(amount=>b.guardAmounts.includes(amount)),JSON.stringify(results));
  assert.ok(a.guardDown&&b.guardDown,JSON.stringify(results));
 }
 if(key==='wavebinder'){
  assert.ok(a.drinkLevels.some(value=>b.drinkLevels.includes(value)),JSON.stringify(results));
  assert.ok(a.valiantLevels.some(value=>b.valiantLevels.includes(value)),JSON.stringify(results));
  assert.ok(results.every(r=>r.drinkDown&&r.valiantAnchor&&r.valiantDown),JSON.stringify(results));
 }
 if(key==='immortal-construct'){
  assert.ok(results.every(result=>result.chantSeen&&result.paidHp===96),JSON.stringify(results));
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
