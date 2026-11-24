import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const lake=process.argv.includes('--lake');
const dry=process.argv.includes('--dry');
const natlan=process.argv.includes('--natlan-entry');
const night=process.argv.includes('--natlan-night');
const north=process.argv.includes('--natlan-north');
const cliff=process.argv.includes('--natlan-cliff');
const northwest=process.argv.includes('--natlan-northwest');
const wayob=process.argv.includes('--natlan-wayob');
const atocpan=process.argv.includes('--natlan-atocpan');
const finalNatlan=process.argv.includes('--natlan-final');
const highland=process.argv.includes('--natlan-highland');
const nodFirst=process.argv.includes('--nod-first');
const nodNorth=process.argv.includes('--nod-north');
const snezFirst=process.argv.includes('--snez-first');
const snezLate=process.argv.includes('--snez-late');
const dornSky=process.argv.includes('--dorn-sky');
const localNatlan=natlan||night||north||cliff||northwest||wayob||atocpan||finalNatlan||highland;
const prefix=dornSky?'evidence/coop-dorn-sky-legends'
 : snezLate?'evidence/coop-snez-late-field-legends':snezFirst?'evidence/coop-snez-first-field-legends'
 : nodNorth?'evidence/coop-nod-north-field-legends':nodFirst?'evidence/coop-nod-first-field-legends'
 : highland?'evidence/coop-natlan-highland-legends':finalNatlan?'evidence/coop-natlan-final-legends'
 : atocpan?'evidence/coop-natlan-atocpan-totem':wayob?'evidence/coop-natlan-wayob-duo'
 : northwest?'evidence/coop-natlan-northwest-legends':cliff?'evidence/coop-natlan-cliff-trials'
 : north?'evidence/coop-natlan-north-trials':night?'evidence/coop-natlan-night-trials'
 : 'evidence/coop-'+(natlan?'natlan-entry':dry?'dry':lake?'lake':'branch')+'-legends';
const dryCases=[
 {tag:'yseut',id:'legend-fontaine_yseut',arena:'yseut-legend-court',
  entry:'fon-wp-50058',hp:1020,mora:300,x:780,warning:'FD12',entities:[97051],
  warningOrder:[[1,'cryo',62],[2,'cryo',106]]},
 {tag:'gravity-device',id:'legend-fontaine_automated_supercomputing_field_generator',arena:'gravity-device-legend-terrace',
  entry:'fon-wp-53859',hp:1230,mora:360,x:820,warning:'FD22',entities:[97052],
  warningOrder:[[1,'geo',69],[2,'geo',112]]},
 {tag:'rocky',id:'legend-fontaine_rocky_avildsen',arena:'rocky-legend-ledge',
  entry:'fon-wp-55780',hp:980,mora:300,x:760,warning:'FD31',entities:[97053],
  warningOrder:[[1,'physical',57],[2,'physical',91]],movingWave:true},
 {tag:'liam',id:'legend-fontaine_liam',arena:'liam-legend-pond',
  entry:'fon-wp-55781',hp:1000,mora:300,x:890,warning:'FD41',entities:[97054],
  warningOrder:[[1,'pyro',65],[2,'pyro',105]]},
 {tag:'deianeira',id:'legend-fontaine_deianeira_of_snezhevna',arena:'deianeira-legend-lab',
  entry:'fon-wp-55768',approach:'fon-wp-55770',quest:'fon-hidden-lab-access',
  hp:1130,mora:330,x:830,warning:'FD52',entities:[97055],
  warningOrder:[[1,'anemo',62],[2,'anemo',111]]},
].map(cfg=>({...cfg,checkpoint:'fontaine-hub'}));
const natlanCases=[
 {tag:'sappho',id:'legend-natlan_sappho',arena:'tepeakak-sappho-bank',
  entry:'nat-wp-72438',hp:1080,mora:465,x:800,warning:'SP02',entities:[97072],
  warningOrder:[[1,'hydro',68],[2,'hydro',111]],provoke:true},
 {tag:'balachko',id:'legend-natlan_balachko',arena:'toyac-balachko-inner-cave',
  approach:'nat-wp-72422',via:'sites-hunt-73160',entry:'toyac-rainbow-key-cave',
  quest:'natlan-rainbow-cave-keys',hp:1250,mora:550,x:842,warning:'BK02',entities:[97077],
  warningOrder:[[1,'pyro',60],[2,'pyro',99],[3,'pyro',138]],lock:'鍵を2本'},
 {tag:'cocijo',id:'legend-natlan_cocijo',arena:'toyac-cocijo-stone-ring',
  approach:'nat-wp-77772',entry:'toyac-electro-crystal-shore',quest:'natlan-toyac-electro-crystals',
  hp:1310,mora:515,x:842,warning:'CJ02',entities:[97078],
  warningOrder:[[1,'electro',69],[2,'electro',111]],lock:'電気水晶'},
].map(cfg=>({...cfg,checkpoint:'natlan-hub'}));
const nightCases=[
 {tag:'undead',id:'legend-natlan_undead',arena:'night-trial-undead',approach:'nat-wp-72417',
  entry:'temple-east-totem-pond',hp:1170,mora:525,x:845,warning:'NU02',entities:[97079],
  warningOrder:[[1,'physical',70],[2,'physical',116]],phase:true},
 {tag:'chimalli',id:'legend-natlan_chimalli',arena:'night-trial-chimalli',approach:'nat-wp-72416',
  entry:'temple-northwest-totem-ravine',hp:1210,mora:515,x:845,warning:'NC02',entities:[97080],
  warningOrder:[[1,'hydro',71],[2,'hydro',121]],phase:true},
].map(cfg=>({...cfg,checkpoint:'natlan-hub'}));
const northCases=[
 {tag:'tlatzacuilotl',id:'legend-natlan_tlatzacuilotl',arena:'night-trial-tlatzacuilotl',
  approach:'nat-wp-72434',underground:'nat-wp-72441',basin:'sulfurous-resonant-basin',
  entry:'sulfurous-totem-cave',quest:'natlan-sulfurous-resonant-stones',
  hp:1150,mora:460,x:845,warning:'NT02',entities:[97081],
  warningOrder:[[1,'geo',68],[2,'geo',117]],lock:'刻印板',phase:true},
 {tag:'ichcahuipilli',id:'legend-natlan_ichcahuipilli',arena:'night-trial-ichcahuipilli',
  approach:'nat-wp-72436',entry:'witztli-sealed-stone-bank',quest:'natlan-witztli-three-echoes',
  hp:1230,mora:525,x:845,warning:'NI01',entities:[97082],
  warningOrder:[[1,'dendro',70],[2,'dendro',120]],lock:'三つの光',phase:true},
].map(cfg=>({...cfg,checkpoint:'natlan-hub'}));
const cliffCases=[
 {tag:'atlatl',id:'legend-natlan_atlatl',arena:'night-trial-atlatl',approach:'nat-wp-72414',
  wall:'tepeacac-waterfall-wall',entry:'ancient-excavation-upper-ledge',quest:'natlan-ancient-excavation-wall',
  hp:1180,mora:470,x:845,warning:'NA02',entities:[97083],warningOrder:[[1,'geo',72],[2,'geo',121]],
  travelerOnly:true,returnY:272,phase:true},
 {tag:'cihuacoatl',id:'legend-natlan_cihuacoatl',arena:'night-trial-cihuacoatl',approach:'nat-wp-72759',
  entry:'canopy-square-plateau',hp:1240,mora:525,x:845,warning:'NS02',entities:[97084],
  warningOrder:[[1,'dendro',66],[2,'dendro',104],[3,'dendro',142]],returnY:207,phase:true},
].map(cfg=>({...cfg,checkpoint:'natlan-hub'}));
const northwestCases=[
 {tag:'rilai',id:'legend-natlan_rilai',arena:'night-wind-rilai-clearing',approach:'nat-wp-79053',
  entry:'night-wind-seaward-fork',quest:'natlan-seaward-signs',hp:1150,mora:530,x:845,
  warning:'NW02',entities:[97085],warningOrder:[[1,'cryo',68],[2,'cryo',117]],provoke:true,returnY:480},
 {tag:'fallen-dawnstar',id:'legend-natlan_fallen_dawnstar',arena:'night-trial-fallen-dawnstar',
  approach:'nat-wp-79053',entry:'night-wind-seaward-fork',quest:'natlan-seaward-signs',hp:1220,mora:550,x:845,
  warning:'NW04',entities:[97086],warningOrder:[[1,'cryo',70],[2,'cryo',118]],returnY:346,phase:true},
 {tag:'ironbeard',id:'legend-natlan_ironbeard',arena:'night-trial-ironbeard',approach:'natlan-port',
  entry:'flower-feather-smiths-ridge',hp:1260,mora:565,x:845,warning:'NW06',entities:[97087],
  warningOrder:[[1,'pyro',69],[2,'pyro',108],[3,'pyro',147]],returnY:343,phase:true},
].map(cfg=>({...cfg,checkpoint:'natlan-hub'}));
const wayobCases=[
 {tag:'potapo',id:'legend-natlan_potapo',arena:'night-trial-potapo',approach:'nat-wp-79051',
  entry:'stadium-west-waterfall-foot',hp:1220,mora:550,x:845,warning:'NP02',entities:[97088],
  warningOrder:[[1,'cryo',68],[2,'cryo',106],[3,'cryo',146]],returnY:480},
 {tag:'tupayo',id:'legend-natlan_tupayo',arena:'night-trial-tupayo',approach:'nat-wp-79542',
  entry:'flower-feather-statue-back-cliff',hp:1280,mora:575,x:845,warning:'NY02',entities:[97089],
  warningOrder:[[1,'pyro',74],[2,'pyro',123]],returnY:274},
].map(cfg=>({...cfg,checkpoint:'natlan-hub',quest:'natlan-two-pillar-trails'}));
const atocpanCases=[
 {tag:'reji',id:'legend-natlan_reji',arena:'night-trial-reji',approach:'nat-wp-79051',
  entry:'tetenanco-seaward-foot',hp:1280,mora:580,x:845,warning:'AR02',entities:[97090],
  warningOrder:[[1,'electro',63],[2,'electro',116]],movingWave:true,returnY:480},
 {tag:'tupu',id:'legend-natlan_tupu',arena:'night-trial-tupu',
  entry:'collective-eastern-headland',hp:1300,mora:590,x:845,warning:'AT02',entities:[97091],
  warningOrder:[[1,'electro',70],[2,'electro',110],[3,'electro',150]],returnY:345},
].map(cfg=>({...cfg,checkpoint:'natlan-hub',quest:'natlan-atocpan-landmarks'}));
const finalNatlanCases=[
 {tag:'peak',id:'legend-natlan_peak',arena:'atocpan-peak-cave',approach:'nat-wp-82557',
  entry:'atocpan-peak-rock-trail',hp:1340,mora:600,x:845,warning:'PF02',entities:[97092],
  warningOrder:[[1,'pyro',68],[2,'pyro',117]],returnY:346},
 {tag:'last-tenochtzitoc',id:'legend-natlan_last_tenochtzitoc',arena:'zapabay-tenochtzitoc-shallows',
  entry:'nat-wp-85972',hp:1370,mora:630,x:845,warning:'ZT02',entities:[97096],
  warningOrder:[[1,'hydro',71],[2,'hydro',112],[3,'hydro',157]],returnY:419},
].map(cfg=>({...cfg,checkpoint:'natlan-hub',quest:'natlan-southern-trail-survey'}));
const highlandCases=[
 {tag:'infinitesimal',id:'legend-natlan_infinitesimal',arena:'sacred-mountain-east-isle-dais',
  approach:'nat-wp-82560',entry:'nat-wp-84107',hp:1420,mora:660,x:832,warning:'MH02',
  entities:[97097],warningOrder:[[1,'pyro',68],[2,'pyro',112]],returnY:401},
 {tag:'bronzelock',id:'legend-natlan_bronzelock',arena:'ochka-bronzelock-island-court',
  entry:'ochka-bronzelock-floating-landing',hp:1880,mora:860,x:832,warning:'BL02',
  entities:[97098],warningOrder:[[1,'physical',73],[2,'physical',117],[3,'physical',165]],returnY:410},
].map(cfg=>({...cfg,checkpoint:'ochkanatlan-dock',quest:'ochka-floating-island-spiritway'}));
const nodFirstCases=[
 {tag:'sigurd',id:'legend-nod_sigurd',arena:'nod-sigurd-grave-court',approach:'nod-wp-88147',
  stops:['nod-wp-88148','nod-bonemos-grave-path'],entry:'nod-bonemos-grave-path',
  quest:'nod-bonemos-offerings',lock:'供え物',hp:1520,mora:680,x:830,warning:'NSG02',
  entities:[97101],warningOrder:[[1,'physical',70],[2,'physical',118]],returnY:480},
 {tag:'crab-tsar',id:'legend-nod_crab_tsar',arena:'nod-crab-tsar-palace',approach:'nod-wp-88131',
  stops:['nod-wp-88138','nod-hiisi-mirror-court'],entry:'nod-hiisi-mirror-court',
  quest:'nod-hiisi-palace-mirrors',hp:1600,mora:715,x:830,warning:'NCT02',
  entities:[97102],warningOrder:[[1,'hydro',72],[2,'hydro',121]],returnY:409},
 {tag:'raskolnikov',id:'legend-nod_raskolnikov',arena:'nod-raskolnikov-upper-ring',approach:'nod-wp-88174',
  stops:['nod-wp-88171','nod-bureau-upper-lift-station'],entry:'nod-bureau-upper-lift-station',
  quest:'nod-bureau-lift-check',lock:'操作盤',hp:1640,mora:750,x:830,warning:'NRK02',
  entities:[97103],warningOrder:[[1,'pyro',72],[2,'pyro',112],[3,'pyro',153]],returnY:407},
].map(cfg=>({...cfg,checkpoint:'nod-town'}));
const nodNorthCases=[
 {tag:'mandragora',leg:'coast',id:'legend-nod_hexadecatonic_mandragora',arena:'nod-mandragora-cliff-foot',
  approach:'nod-wp-92875',entry:'nod-pyramid-seaward-steps',hp:1640,mora:748,x:825,warning:'NNM02',
  entities:[97104],warningOrder:[[1,'dendro',72],[2,'dendro',122]],shelves:[[596,411]],returnY:480},
 {tag:'hiljetta',leg:'peninsula',id:'legend-nod_hiljetta',arena:'nod-hiljetta-peninsula-camp',
  approach:'nod-wp-92879',alternate:'nod-wp-92880',entry:'nod-wind-fort-peninsula',
  hp:1600,mora:753,x:825,warning:'NNH02',entities:[97105],
  warningOrder:[[1,'physical',70],[2,'physical',121]],shelves:[],returnY:480},
 {tag:'homesick-wolf',leg:'ridge',id:'legend-nod_homesick_lone_wolf',arena:'nod-homesick-wolf-lakeland',
  approach:'nod-wp-92889',entry:'nod-aamsvaltnir-east-ridge',hp:1720,mora:785,x:825,warning:'NNW02',
  entities:[97106],warningOrder:[[1,'cryo',75],[2,'cryo',118],[3,'cryo',163]],shelves:[[570,412],[836,345]],returnY:345},
].map(cfg=>({...cfg,checkpoint:'nod-north-harbor',quest:'nod-north-landmark-round'}));
const snezFirstCases=[
 {tag:'churin',id:'legend-snez_churin',arena:'sne-churin-snow-court',approach:'sne-wp-100697',
  square:'sne-churin-snow-square',firstBout:'sne-churin-apprentice-bout',entry:'sne-churin-bragin-bout',
  quest:'sne-snow-sculptor-bouts',hp:1770,mora:810,x:830,warning:'SC02',
  entities:[97107],warningOrder:[[1,'cryo',70],[2,'cryo',120]],returnY:480},
 {tag:'bandersnatch',id:'legend-snez_bandersnatch',arena:'sne-bandersnatch-ice-cavern',approach:'sne-wp-100658',
  entry:'sne-svetloredovka-ice-passage',quest:'sne-svetloredovka-cavern-check',lock:'操作盤',
  hp:1850,mora:840,x:830,warning:'SB02',entities:[97108],
  warningOrder:[[1,'cryo',74],[2,'cryo',117],[3,'cryo',161]],returnY:411},
 {tag:'furiosa',id:'legend-snez_furiosa',arena:'sne-furiosa-domain-outlook',approach:'sne-wp-100695',
  entry:'sne-obsession-scar-upper-trail',domain:'sites-hunt-100707',hp:1890,mora:860,x:830,
  warning:'SF02',entities:[97109],warningOrder:[[1,'physical',72],[2,'physical',116],[3,'physical',158]],returnY:480},
].map(cfg=>({...cfg,checkpoint:'snezhnaya-hub'}));
const snezLateCases=[
 {tag:'ancient-mouse',id:'legend-snez_ancient_ironquill',arena:'sne-ancient-mouse-den',
  approach:'sne-wp-106194',entry:'sne-merciful-fissure',quest:'sne-rescue-three-mice',
  checkpoint:'snezhnaya-hub',lock:'三匹',hp:1920,mora:875,x:830,warning:'SLM02',
  entities:[97110],warningOrder:[[1,'physical',72],[2,'physical',119]],returnY:393},
 {tag:'calamitous-tree',id:'legend-snez_elder_blighttree',arena:'sne-crystal-tree-refuge',
  approach:'sne-wp-106186',junction:'sne-crystal-mining-junction',entry:'sne-crystal-prism-gallery',
  quest:'sne-crystal-stream-survey',checkpoint:'novokichev-camp',lock:'水門',
  hp:2750,mora:1210,x:830,warning:'SLT02',entities:[97111],
  warningOrder:[[1,'geo',75],[2,'geo',118],[3,'geo',163]],returnY:389},
];
const dornSkyCases=[
 {tag:'churldric',id:'legend-mondstadt_churldric',arena:'dorn-churldric-cooking-camp',
  checkpoint:'dornman-camp',approach:'dornman-camp',entry:'dorn-shieldrol-lake-trail',
  hp:2100,mora:950,x:830,warning:'DC02',entities:[97116],warningOrder:[[1,'geo',72],[2,'geo',120]],returnY:406},
 {tag:'maha',id:'legend-mondstadt_maha_vasudevayaputra',arena:'sky-maha-pavilion-court',
  checkpoint:'nat-sky-camp',approach:'nat-wp-96377',entry:'sky-sand-pavilion-walk',quest:'sky-pavilion-notes',
  lock:'マーダヴァ',hp:2420,mora:1050,x:830,warning:'SM02',entities:[97117],
  warningOrder:[[1,'geo',74],[2,'geo',118],[3,'geo',165]],returnY:409},
];
const cases=dornSky?dornSkyCases:snezLate?snezLateCases:snezFirst?snezFirstCases:nodNorth?nodNorthCases:nodFirst?nodFirstCases:highland?highlandCases:finalNatlan?finalNatlanCases:atocpan?atocpanCases:wayob?wayobCases:northwest?northwestCases:cliff?cliffCases:north?northCases:night?nightCases:natlan?natlanCases:dry?dryCases:lake?[
 {tag:'vivianne',id:'legend-fontaine_vivianne_of_the_lake',arena:'vivianne-legend-bank',
  entry:'fon-wp-50056',checkpoint:'fontaine-hub',hp:1040,mora:300,x:890,warning:'LV02',entities:[97041],
  warningOrder:[[1,'hydro',64],[2,'hydro',115]],movingWave:true},
 {tag:'ninianne',id:'legend-fontaine_ninianne_of_the_lake',arena:'ninianne-legend-bank',
  entry:'fon-wp-50042',checkpoint:'fontaine-hub',hp:1010,mora:300,x:860,warning:'LN03',entities:[97042],
  warningOrder:[[1,'hydro',63],[2,'hydro',107]]},
]:[
 {tag:'chizhang',id:'legend-liyue_rulers_of_chizhang_mountains',arena:'chizhang-legend-terrace',
  entry:'liyue-wp-64830',checkpoint:'chenyu-camp',hp:1060,mora:280,x:700,warning:'LC03',entities:[97021,97022],
  warningOrder:[[1,'pyro',63],[2,'cryo',111]]},
 {tag:'cineas',id:'legend-fontaine_cineas',arena:'cineas-legend-chamber',
  entry:'bygone-wp-68610',checkpoint:'bygone-camp',hp:1320,mora:440,x:925,warning:'LW03',entities:[97031],
  warningOrder:[[1,'hydro',63],[2,'hydro',116]]},
];
const artSource=dry?'fontaine-dry-legend-poses-source-v1.png':lake?'fontaine-lake-legend-poses-source-v6.png':null;
const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const nodes=Object.fromEntries(graph.nodes.map(row=>[row.id,row]));
const key='maple-lua-lab.checkpoint.v1';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-gpu']});
let pages=[];
const errors=[];
const frame=p=>p.evaluate(()=>window.lab.frame);
const wait=(p,fn,arg,timeout=70000)=>p.waitForFunction(fn,arg,{timeout});
const capture=(p,t)=>p.locator('.game').screenshot({path:prefix+'-'+t+'.png'});

async function start(cfg,needsReport){
 const context=await browser.newContext({viewport:{width:1200,height:940}});
 const page=await context.newPage();
 pages.push(page);
 page.setDefaultTimeout(45000);
 page.on('pageerror',e=>errors.push(e.message));
 const route=waypointDriver(page,nodes,{walkTimeout:32000});
 const suffix=needsReport?'-before-report-fixture.json':'-fixture.json';
 const fixturePath=dornSky?'work/final-field-legends-fixture.json'
  : snezLate?'work/snez-late-field-legends-fixture.json':snezFirst?'work/snez-first-field-legends-coop-fixture.json'
  : nodNorth?'work/nod-north-field-legends-fixture.json':nodFirst?'work/nod-first-field-legends-fixture.json'
  : highland?'work/natlan-highland-legends-fixture.json':finalNatlan?'work/natlan-final-legends-fixture.json'
  : atocpan?'work/natlan-atocpan-totem-fixture.json':wayob?'work/natlan-wayob-duo-fixture.json'
  : northwest?'work/natlan-northwest-legends-fixture.json':cliff?'work/natlan-cliff-trials-fixture.json'
  : north?'work/natlan-north-trials-fixture.json':night?'work/natlan-night-trial-fixture.json'
  : natlan?'work/coop-natlan-entry-legends-fixture.json':'work/coop-'+cfg.arena+suffix;
 const fixture=await fs.readFile(fixturePath,'utf8');
 const port=(localNatlan||nodFirst||nodNorth||snezFirst||snezLate||dornSky)?9068:dry?9064:lake?9063:9060;
 await page.goto(process.env.LAB_URL||`http://127.0.0.1:${port}/`);
 await wait(page,()=>window.lab?.frame);
 await page.evaluate(([key,fixture])=>localStorage.setItem(key,fixture),[key,fixture]);
 await page.locator('#loadProgress').click();
 await route.waitNode(cfg.checkpoint);
 if(localNatlan||nodFirst||nodNorth||snezFirst||snezLate||dornSky){
  for(const id of cfg.quests??(cfg.quest?[cfg.quest]:[])) await route.accept(id);
 }
 const approach=cfg.approach??cfg.entry;
 if(approach!==cfg.checkpoint) await route.warp(approach);
 await page.locator('#coopPanel summary').click();
 return {context,page,route};
}

async function lockedNatlanGate({page,route},cfg,target=cfg.arena){
 const origin=await route.node();
 const gate=nodes[origin].exits.find(edge=>edge.to===target);
 await route.walk(gate.x);
 await route.changeHeight(gate.y??480);
 await wait(page,({arena,lock})=>{
  const portal=window.lab.frame.storyNearbyPortal;
  return portal?.to===arena&&!portal.available&&portal.reason.includes(lock);
 },{arena:target,lock:cfg.lock});
 await page.keyboard.press('KeyF');
 assert.equal(await route.node(),origin);
}

async function collectSpot({page,route},spot){
 await route.walk(spot.x);
 await route.changeHeight(spot.y??480);
 await page.keyboard.press('KeyG');
}

async function prepareCliffTrial(players,cfg){
 if(cfg.wall){
  const {itinerary}=graph.quests.find(q=>q.id===cfg.quest);
  await Promise.all(players.map(async ({page,route})=>{
   await route.cross(cfg.wall);
   await collectSpot({page,route},itinerary[0]);
   await route.count(cfg.quest,1);
   await Promise.all([
    route.cross(cfg.entry),
    wait(page,()=>window.lab.frame.storyLift?.wall===true),
   ]);
   await route.count(cfg.quest,2);
   await collectSpot({page,route},itinerary[2]);
   await route.count(cfg.quest,3);
   await page.keyboard.press('KeyE');
   await wait(page,()=>window.lab.frame.active===2);
  }));
  return;
 }
 await Promise.all(players.map(async ({route})=>{
  await route.cross(cfg.entry);
  for(const [x,y] of [[495,412],[631,343],[870,275],[1143,207]]){
   await route.walk(x);
   await route.changeHeight(y);
  }
 }));
}

async function prepareNorthwestTrial(players,cfg){
 const shelves=cfg.quest?[[650,414],[935,346]]:[[510,411],[945,343]];
 const quest=graph.quests.find(q=>q.id===cfg.quest);
 await Promise.all(players.map(async player=>{
  const {route}=player;
  await route.cross(cfg.entry);
  if(quest){
   await collectSpot(player,quest.itinerary[0]);
   await route.count(cfg.quest,1);
  }
  for(const [x,y] of shelves){
   await route.walk(x);
   await route.changeHeight(y);
  }
  if(quest){
   await collectSpot(player,quest.itinerary[1]);
   await route.count(cfg.quest,2);
  }
 }));
}

async function prepareNorthTrial(players,cfg){
 if(cfg.basin){
  await Promise.all(players.map(async ({route})=>{
   await route.cross(cfg.underground);
   await route.cross(cfg.basin);
  }));
  const {order,stones}=nodes[cfg.basin].resonance;
  for(const player of players){
   await lockedNatlanGate(player,cfg,cfg.entry);
   for(const index of order) await collectSpot(player,stones[index-1]);
   await player.route.count(cfg.quest,1);
   await player.route.cross(cfg.entry);
  }
  return;
 }
 await Promise.all(players.map(({route})=>route.cross(cfg.entry)));
 const paths=graph.quests.find(q=>q.id===cfg.quest).paths;
 for(const [index,player] of players.entries()){
  await lockedNatlanGate(player,cfg);
  const order=index===0?paths:[...paths].reverse();
  for(const path of order){
   const spot=path.steps[0];
   await player.route.cross(spot.node);
   await collectSpot(player,spot);
   await wait(player.page,({quest,id})=>window.lab.frame.story.quests[quest]?.pathProgress?.[id]?.count===1,
    {quest:cfg.quest,id:path.id});
   await player.route.cross(cfg.entry);
  }
  await player.route.count(cfg.quest,2);
 }
}

async function openNatlanGate({page,route},cfg){
 if(cfg.tag==='balachko'){
  const {itinerary}=graph.quests.find(q=>q.id===cfg.quest);
  for(const [index,step] of itinerary.slice(1).entries()){
   await collectSpot({page,route},step);
   await route.count(cfg.quest,index+2);
  }
 }else{
  await page.keyboard.press('KeyE');
  await wait(page,()=>window.lab.frame.active===2);
  const stones=nodes[cfg.entry].breakTargets;
  for(const [index,stone] of [stones[2],stones[0],stones[1]].entries()){
   await route.walk(stone.x+55);
   await route.walk((await route.actor()).x-25);
   const expected=index===2?'3つ砕きました':(index+1)+' / 3';
   for(let attempt=0;attempt<5;attempt++){
    await page.keyboard.press('KeyK');
    try{
     await wait(page,label=>window.lab.frame.storyNotice?.includes(label),expected,1400);
     break;
    }catch(error){
     if(error.name!=='TimeoutError'||attempt===4)throw error;
    }
   }
  }
  await route.count(cfg.quest,1);
  await page.keyboard.press('KeyE');
  await wait(page,()=>window.lab.frame.active===1);
 }
 await route.cross(cfg.arena);
}

async function verifyQuestReports(players,cfg,quests=cfg.quest?[cfg.quest]:[]){
 await Promise.all(players.map(async ({page,route})=>{
  await page.reload();
  await wait(page,()=>window.lab?.frame);
  await page.locator('#loadProgress').click();
  await wait(page,()=>document.querySelector('#saveStatus').textContent.includes('町から再開しました'));
  await route.waitNode(cfg.checkpoint);
  for(const id of quests){
   const quest=graph.quests.find(q=>q.id===id);
   if(await route.node()!==quest.hub) await route.warp(quest.hub);
   const before=await frame(page);
   await route.report(id);
   const after=await frame(page);
   assert.deepEqual([after.progression.questXp-before.progression.questXp,after.mora-before.mora],
    [quest.xp,quest.mora]);
  }
 }));
}

async function reportFromWaterway({page,route},cfg,code){
 const gate=nodes[cfg.entry].exits.find(edge=>edge.to===cfg.arena);
 await route.walk(gate.x);
 await route.changeHeight(gate.y);
 await wait(page,n=>{
  const g=window.lab.frame.storyNearbyPortal;
  return g?.to===n&&!g.available&&g.reason.includes('報告');
 },cfg.arena);
 await page.keyboard.press('KeyF');
 assert.equal(await route.node(),cfg.entry);
 const {itinerary}=graph.quests.find(q=>q.id===cfg.quest);
 const inspect=itinerary[1];
 await route.cross(cfg.approach);
 await route.warp(cfg.checkpoint);
 await route.accept(cfg.quest);
 await route.warp(cfg.approach);
 await route.cross(cfg.entry);
 await route.count(cfg.quest,1);
 await route.walk(inspect.x);
 await route.changeHeight(inspect.y);
 await page.keyboard.press('KeyG');
 await route.count(cfg.quest,2);
 await route.cross(cfg.approach);
 await route.count(cfg.quest,3);
 await route.warp(cfg.checkpoint);
 await route.report(cfg.quest);
 await route.warp(cfg.approach);
 await route.cross(cfg.entry);
 assert.equal((await frame(page)).coop.code,code);
}

async function drive(page,cfg,side){
 await page.evaluate(({cfg,side})=>{
  document.activeElement.blur();
  const keys=new Set(),moves=new Set();
  const start=window.lab.frame.t;
  let jumpAt=-1;
  window.branchLegendFight=false;
  window.branchLegendResult=null;
  function key(code,on){
   if(keys.has(code)===on)return;
   on?keys.add(code):keys.delete(code);
   window.dispatchEvent(new KeyboardEvent(on?'keydown':'keyup',{code,bubbles:true,cancelable:true}));
  }
  function step(){
   const f=window.lab.frame,b=f.fieldBoss,a=f.actors[f.active-1];
   if(f.story.node!==cfg.arena||b?.phase==='cleared'||f.returns||f.t-start>125){
    for(const code of [...keys])key(code,false);
    window.branchLegendResult={won:b?.phase==='cleared',returns:f.returns,hp:a.hp,moves:[...moves]};
    return;
   }
   if(b?.move)moves.add(b.move);
   const body=b?.bodies?.[side<0?0:1];
   const target=body?.x??b?.x??cfg.x;
   let goal=target+(b?side*70:-180),jump=!a.ground,evading=false;
   for(const w of (Array.isArray(b?.warnings)?b.warnings:[])){
    const delta=w.first-b.tick;
    if(a.x<w.left-12||a.x>w.right+12)continue;
    if(delta<=14&&b.tick<w.after){
     if(w.height<95&&a.ground&&f.t-jumpAt>.62){
      window.lab.action('jump');jumpAt=f.t;jump=true;
     }else if(w.height>=95){
      goal=a.x<(w.left+w.right)/2?w.left-27:w.right+27;
      evading=true;
     }
    }
   }
   const dx=target-a.x,turn=Math.abs(dx)>8&&dx*a.dir<0;
   const delta=goal-a.x;
   const walk=Math.abs(delta)>8?Math.sign(delta):turn?Math.sign(dx):0;
   key('KeyA',walk<0);key('KeyD',walk>0);key('Space',jump);
   key('KeyJ',window.branchLegendFight&&!evading&&!turn&&Math.abs(dx)<112);
   requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
 },{cfg,side});
}

async function createRoom(players){
 const [a,b]=players.map(p=>p.page);
 await a.locator('#coopCreate').click();
 await wait(a,()=>window.lab.frame.coop?.code);
 const code=(await frame(a)).coop.code;
 await b.locator('#coopCode').fill(code);
 await b.locator('#coopJoin').click();
 await wait(b,c=>window.lab.frame.coop?.code===c,code);
 return code;
}

async function enterIndividually(players,cfg){
 const [host,guest]=players;
 await host.route.cross(cfg.arena);
 assert.equal(await guest.route.node(),cfg.entry);
 await wait(guest.page,arena=>window.lab.frame.coop?.peers[0]?.map===arena,cfg.arena);
 await guest.route.cross(cfg.arena);
}

async function scenario(cfg){
 pages=[];
 const players=await Promise.all([start(cfg,false),start(cfg,Boolean(cfg.quest))]);
 const code=await createRoom(players);
 if(northwest) await prepareNorthwestTrial(players,cfg);
 if(cfg.phase){
  if(cliff) await prepareCliffTrial(players,cfg);
  else if(north) await prepareNorthTrial(players,cfg);
  else if(!northwest) await Promise.all(players.map(p=>p.route.cross(cfg.entry)));
  await enterIndividually(players,cfg);
 }else if(natlan&&cfg.quest){
  await Promise.all(players.map(async ({route})=>{
   if(cfg.via) await route.cross(cfg.via);
   await route.cross(cfg.entry);
  }));
  assert.ok((await Promise.all(players.map(p=>frame(p.page)))).every(
   f=>f.coop.code===code&&f.coop.shared===(cfg.tag==='balachko')));
  await lockedNatlanGate(players[0],cfg);
  await openNatlanGate(players[0],cfg);
  await lockedNatlanGate(players[1],cfg);
  await openNatlanGate(players[1],cfg);
 }else if(cfg.approach&&!northwest){
  await Promise.all(players.map(p=>p.route.cross(cfg.entry)));
  const cave=await Promise.all(players.map(p=>frame(p.page)));
  assert.ok(cave.every(f=>f.storySwim&&f.coop.code===code&&f.coop.map===cfg.entry));
  await players[0].route.cross(cfg.arena);
  await reportFromWaterway(players[1],cfg,code);
 }
 if(!cfg.phase&&(!natlan||!cfg.quest)){
  const entrants=cfg.approach&&!northwest?players.slice(1):players;
  await Promise.all(entrants.map(p=>p.route.cross(cfg.arena)));
 }
 const proof=await fightAndSave(players,cfg);
 await rematch(players,cfg);
 if(localNatlan) await verifyQuestReports(players,cfg);
 await Promise.all(players.map(p=>p.context.close()));
 return {...proof,sharedRematch:true,
  ...(northwest?{returnY:cfg.returnY,restoredBoth:true,...(cfg.phase?{independentPillarTransfers:true}:{neutralUntilHit:true}),
    ...(cfg.quest?{bothReported:true}:{})}
   :cliff?{independentPillarTransfers:true,returnY:cfg.returnY,restoredBoth:true,
    ...(cfg.travelerOnly?{bothTravelersOnly:true,companionsRestored:true,bothReported:true}:{})}
   :north?{independentPillarTransfers:true,personalQuestGate:true,bothReported:true,restoredBoth:true}
   :night?{independentPillarTransfers:true,restoredBoth:true}
   :natlan?{restoredBoth:true,...(cfg.provoke?{neutralUntilHit:true}:{}),
    ...(cfg.quest?{personalQuestGate:true,bothReported:true}:{})}
   :cfg.quest?{personalQuestGate:true,sharedUnderwaterApproach:true}:{})};
}

async function fightAndSave(players,cfg){
 const [a,b]=players.map(p=>p.page);
 await Promise.all(players.map(({page})=>wait(page,n=>{
  const f=window.lab.frame;
  return f.story.node===n&&f.coop?.peers[0]?.actors.length>=1;
 },cfg.arena)));
 const before=await Promise.all(players.map(p=>frame(p.page)));
 assert.ok(before.every(f=>!f.storySwim));
 if(cfg.travelerOnly){
  assert.ok(before.every(f=>f.storyTravelerTrial&&f.active===1&&f.actors[1].hp===0));
 }
 if(cfg.provoke){
  await Promise.all(players.map(({route},i)=>route.walk(cfg.x-52-i*75)));
  const start=(await frame(a)).t;
  await wait(a,t=>window.lab.frame.t>t+.8,start);
  assert.ok((await Promise.all(players.map(p=>frame(p.page)))).every(f=>
   f.fieldBoss.phase==='available'&&f.fieldBoss.hp===cfg.hp));
  await a.keyboard.down('KeyJ');
  try{
   await wait(b,hp=>window.lab.frame.fieldBoss.hp<hp,cfg.hp);
  }finally{await a.keyboard.up('KeyJ')}
 }
 await Promise.all([drive(a,cfg,-1),drive(b,cfg,1)]);
 if(cfg.travelerOnly){
  await Promise.all(players.map(({page})=>wait(page,()=>
   document.querySelector('#fieldBossLabel').textContent.includes('旅人のみで共闘')&&
   document.querySelector('#a2').hidden)));
 }
 const warnings=await Promise.all(players.map(async ({page})=>{
  const token=await wait(page,({move,count})=>{
   const b=window.lab.frame.fieldBoss;
   return b?.move===move&&b.warnings?.length===count&&b.warnings.map(w=>[w.number,w.element,w.first,w.left,w.right]);
  },{move:cfg.warning,count:cfg.warningOrder.length});
  return token.jsonValue();
 }));
 assert.deepEqual(warnings[0],warnings[1]);
 assert.deepEqual(warnings[0].map(x=>x.slice(0,3)),cfg.warningOrder);
 if(artSource){
  await Promise.all(players.map(({page})=>wait(page,source=>{
   const draws=window.lab.frame.draws;
   return draws.some(d=>d.source===source)&&draws.some(d=>d.kind==='rect'&&d.color==='#17344c');
  },artSource)));
 }
 if(cfg.movingWave){
  await Promise.all(players.map(({page})=>wait(page,move=>{
   const b=window.lab.frame.fieldBoss;
   const wave=b?.move===move&&b.warnings.find(w=>w.number===1&&w.active);
   return wave&&wave.activeRight-wave.activeLeft<wave.right-wave.left;
  },cfg.warning)));
 }
 await capture(a,cfg.tag+'-warning');
 await Promise.all(players.map(p=>p.page.evaluate(()=>{window.branchLegendFight=true})));
 await Promise.all(players.map(({page})=>wait(page,()=>window.branchLegendResult,null,155000)));
 const results=await Promise.all(players.map(p=>p.page.evaluate(()=>window.branchLegendResult)));
 assert.ok(results.every(r=>r.won&&r.returns===0),JSON.stringify(results));
 const after=await Promise.all(players.map(p=>frame(p.page)));
 const rewards=after.map((f,i)=>[f.progression.killXp-before[i].progression.killXp,f.mora-before[i].mora]);
 assert.ok(rewards[0][0]>0&&rewards.every(r=>r[0]===rewards[0][0]&&r[1]===cfg.mora));
 const contacts=after.map(f=>f.events.filter(e=>e.kind==='hit'&&e.actor===1&&cfg.entities.includes(e.target)).length);
 assert.ok(contacts.every(count=>count>0));
 await Promise.all(players.map(async ({page})=>{
  await page.locator('#saveProgress').click();
  await wait(page,([key,id])=>JSON.parse(localStorage.getItem(key))?.endgame?.bosses?.[id]?.clears===1,[key,cfg.id]);
 }));
 return {results,warnings:warnings[0],rewards,contacts,saved:true};
}

async function leaveArena(players,cfg){
 await Promise.all(players.map(p=>p.route.cross(cfg.entry)));
 if(cfg.returnY!==undefined){
  const returned=await Promise.all(players.map(p=>frame(p.page)));
  assert.ok(returned.every(f=>f.actors[0].y===cfg.returnY));
  if(cfg.travelerOnly) assert.ok(returned.every(f=>!f.storyTravelerTrial&&f.active===2&&f.actors[1].hp>0));
 }
}

async function rematch(players,cfg){
 await leaveArena(players,cfg);
 await Promise.all(players.map(p=>p.route.cross(cfg.arena)));
 const restart=await Promise.all(players.map(p=>frame(p.page)));
 assert.ok(restart.every(f=>f.coop.enemies[0]?.hp===cfg.hp));
}

async function climb(route,shelves){
 for(const [x,y] of shelves){
  await route.walk(x);
  await route.changeHeight(y);
 }
}

async function crossShared({route,page},id,code){
 await route.cross(id);
 const {coop}=await frame(page);
 assert.ok(coop.shared&&coop.code===code&&coop.map===id);
}

async function wayobJourney(){
 const [water,cliff]=cases;
 const players=await Promise.all([start(water,false),start(water,false)]);
 const code=await createRoom(players);
 const {itinerary}=graph.quests.find(q=>q.id===water.quest);
 const proof={};
 for(const [index,cfg] of cases.entries()){
  await Promise.all(players.map(async player=>{
   const {route,page}=player;
   await route.cross(cfg.entry);
   if(cfg===water){
    assert.equal((await route.actor()).y,335);
    await climb(route,[[580,407]]);
   }else{
    await climb(route,[[475,412],[682,343],[1000,274]]);
   }
   await route.count(cfg.quest,index);
   await collectSpot(player,itinerary[index]);
   await route.count(cfg.quest,index+1);
   assert.equal((await frame(page)).coop.code,code);
  }));
  await enterIndividually(players,cfg);
  proof[cfg.tag]=await fightAndSave(players,cfg);
  await rematch(players,cfg);
  await leaveArena(players,cfg);
  Object.assign(proof[cfg.tag],{independentPillarTransfers:true,returnY:cfg.returnY,sharedRematch:true});
  if(cfg===water){
   console.log('Chrome: both players cleared Potapo and returned to the waterfall pillar.');
   await Promise.all(players.map(async player=>{
    await climb(player.route,[[665,407],[370,335]]);
    for(const id of [water.approach,'nat-wp-72429','natlan-field','natlan-port',cliff.approach]){
     await crossShared(player,id,code);
    }
   }));
  }
 }
 await verifySavedReports(players,cases);
 const routes=players.map(p=>p.route.journeys);
 await Promise.all(players.map(p=>p.context.close()));
 return {...proof,routes,sharedRoomAcrossBothRoutes:true,bothReported:true,reportRestoredForBoth:true};
}

async function atocpanJourney(){
 const [reji,tupu]=cases;
 const rim='nat-wp-82559',valley='nat-wp-82562',island='nat-wp-82563';
 const players=await Promise.all([start(reji,false),start(reji,false)]);
 const [host,guest]=players;
 const code=await createRoom(players);
 const {itinerary}=graph.quests.find(q=>q.id===reji.quest);
 await Promise.all(players.map(async player=>{
  for(const id of ['nat-wp-82572','nat-wp-82558',rim,reji.entry]) await crossShared(player,id,code);
  assert.equal((await player.route.actor()).y,414);
  await collectSpot(player,itinerary[0]);
  await player.route.count(reji.quest,1);
 }));
 await enterIndividually(players,reji);
 const rejiProof=await fightAndSave(players,reji);
 await rematch(players,reji);
 await leaveArena(players,reji);
 console.log('Chrome: both players cleared Reji and returned to the hillside pillar.');
 await Promise.all(players.map(async player=>{
  await climb(player.route,[[415,414]]);
  for(const id of [rim,'nat-wp-82557','nat-wp-82560','nat-wp-82561',valley]){
   await crossShared(player,id,code);
  }
 }));
 await crossShared(host,tupu.entry,code);
 assert.equal(await guest.route.node(),valley);
 await crossShared(guest,island,code);
 await Promise.all([
  crossShared(guest,tupu.entry,code),
  (async()=>{
   await wait(guest.page,()=>window.lab.frame.storyLift?.boat);
   assert.equal(await host.route.node(),tupu.entry);
   await capture(guest.page,'tupu-ferry');
  })(),
 ]);
 assert.equal(guest.route.journeys.at(-1)[2],'boat');
 assert.equal(host.route.journeys.at(-1)[2],'raised');
 await Promise.all(players.map(async player=>{
  await climb(player.route,[[536,414],[735,345]]);
  await collectSpot(player,itinerary[1]);
  await player.route.count(tupu.quest,2);
 }));
 await enterIndividually(players,tupu);
 const tupuProof=await fightAndSave(players,tupu);
 await rematch(players,tupu);
 await leaveArena(players,tupu);
 await verifySavedReports(players,cases);
 const routes=players.map(p=>p.route.journeys);
 await Promise.all(players.map(p=>p.context.close()));
 return {reji:{...rejiProof,returnY:reji.returnY,sharedRematch:true},
  tupu:{...tupuProof,returnY:tupu.returnY,sharedRematch:true},
  routes,sharedRoomAcrossBothRoutes:true,footAndFerryRegroup:true,
  independentPillarTransfers:true,bothReported:true,reportRestoredForBoth:true};
}

async function verifySavedReports(players,bosses){
 const cfg=bosses.at(-1);
 const ids=bosses.map(boss=>boss.id);
 const quests=[...new Set(bosses.map(boss=>boss.quest).filter(Boolean))];
 await verifyQuestReports(players,cfg,quests);
 await Promise.all(players.map(async ({page,route})=>{
  await page.locator('#saveProgress').click();
  await wait(page,({key,quests,ids})=>{
   const data=JSON.parse(localStorage.getItem(key));
   return quests.every(id=>data?.story?.quests?.[id]?.status==='complete')&&ids.every(id=>data?.endgame?.bosses?.[id]?.clears===1);
  },{key,quests,ids});
  await page.reload();
  await wait(page,()=>window.lab?.frame);
  await page.locator('#loadProgress').click();
  await wait(page,()=>document.querySelector('#saveStatus').textContent.includes('町から再開しました'));
  await route.waitNode(cfg.checkpoint);
  await wait(page,ids=>ids.every(id=>window.lab.frame.story.quests[id]?.status==='complete'),quests);
 }));
}

async function finalNatlanJourney(){
 const [peak,teno]=cases;
 const players=await Promise.all([start(peak,false),start(peak,false)]);
 const code=await createRoom(players);
 const {itinerary}=graph.quests.find(q=>q.id===peak.quest);
 const foothills='nat-wp-82571',fork='nat-wp-82570',coast='nat-wp-82564';
 const grassland='atocpan-domain-side-clearing',port='natlan-port',pier='nat-resort-pier';
 await Promise.all(players.map(async player=>{
  for(const id of [fork,foothills,peak.entry]) await crossShared(player,id,code);
  await climb(player.route,[[526,412],[851,346]]);
  await collectSpot(player,itinerary[0]);
  await player.route.count(peak.quest,1);
 }));
 await enterIndividually(players,peak);
 const peakProof=await fightAndSave(players,peak);
 await rematch(players,peak);
 await leaveArena(players,peak);
 console.log('Chrome: both players cleared Peak and returned to the upper ledge.');
 await Promise.all(players.map(async (player,index)=>{
  const path=[foothills,fork,peak.approach,'nat-wp-82560','nat-wp-82561','nat-wp-82562',coast];
  for(const id of path) await crossShared(player,id,code);
  if(index===1) await crossShared(player,'sites-hunt-82577',code);
  await crossShared(player,grassland,code);
  await collectSpot(player,itinerary[1]);
  await player.route.count(peak.quest,2);
  await player.route.warp(port);
  assert.equal((await frame(player.page)).coop.code,code);
 }));
 await Promise.all(players.map(player=>crossShared(player,pier,code)));
 assert.ok(players.every(player=>player.route.journeys.at(-1)[2]==='boat'));
 await Promise.all(players.map(async player=>{
  for(const id of ['nat-wp-85957','nat-wp-85960','nat-wp-85962','nat-wp-85968','nat-wp-85969',teno.entry]){
   await crossShared(player,id,code);
  }
 }));
 await enterIndividually(players,teno);
 const tenoProof=await fightAndSave(players,teno);
 await rematch(players,teno);
 await leaveArena(players,teno);
 await verifySavedReports(players,cases);
 const routes=players.map(p=>p.route.journeys);
 await Promise.all(players.map(p=>p.context.close()));
 return {peak:{...peakProof,returnY:peak.returnY,sharedRematch:true},
  lastTenochtzitoc:{...tenoProof,returnY:teno.returnY,sharedRematch:true,shallowGround:true},
  routes,bothGrasslandRoutes:true,sharedRoomAcrossBothRoutes:true,bothReported:true,reportRestoredForBoth:true};
}

const deviceCount=page=>page.evaluate(()=>window.lab.frame.draws.filter(draw=>draw.text==='浮遊装置').length);

async function breakHighlandDevice({route,page},point,remaining){
 await route.walk(point.x-36);
 await route.changeHeight(point.y);
 await route.walk((await route.actor()).x+25);
 await page.keyboard.down('KeyJ');
 try{
  await wait(page,left=>window.lab.frame.draws.filter(draw=>draw.text==='浮遊装置').length===left,remaining);
 }finally{
  await page.keyboard.up('KeyJ');
 }
}

async function highlandJourney(){
 const [small,bronze]=cases;
 const [camp,reef,shore]=['nat-mountain-camp','nat-wp-80030','ochka-bronzelock-device-shore'];
 const players=await Promise.all([start(small,false),start(small,false)]);
 const [host,guest]=players;
 const code=await createRoom(players);
 await Promise.all(players.map(async player=>{
  await climb(player.route,[[1280,408],[1472,371]]);
  for(const id of [camp,'nat-wp-84104','nat-wp-84105','nat-wp-84106','nat-wp-84108','nat-wp-84109',small.entry]){
   await crossShared(player,id,code);
  }
 }));
 await enterIndividually(players,small);
 const smallProof=await fightAndSave(players,small);
 await rematch(players,small);
 await leaveArena(players,small);
 console.log('Chrome: both players cleared Infinitesimal and returned to the island ledge.');

 await Promise.all(players.map(async player=>{
  await player.route.warp(bronze.checkpoint);
  for(const id of ['ochkanatlan-ruins','nat-wp-79546','nat-wp-80846','nat-wp-79550',reef]){
   await crossShared(player,id,code);
  }
  await player.route.cross(shore);
  const {coop}=await frame(player.page);
  assert.ok(!coop.shared&&coop.code===code);
  assert.equal(await deviceCount(player.page),2);
 }));
 const [west,east]=nodes[shore].breakTargets;
 await breakHighlandDevice(guest,east,1);
 await breakHighlandDevice(host,west,1);
 await breakHighlandDevice(host,east,0);
 await host.route.count(bronze.quest,1);
 await Promise.all([
  crossShared(host,bronze.entry,code),
  wait(host.page,()=>window.lab.frame.storyLift?.spiritway&&window.lab.frame.actors[0].y<290)
   .then(()=>capture(host.page,'spiritway')),
 ]);
 await host.route.count(bronze.quest,2);
 assert.equal(await deviceCount(guest.page),1);
 await lockedNatlanGate(guest,{arena:bronze.entry,lock:'二つ'});
 await guest.route.count(bronze.quest,0);
 await breakHighlandDevice(guest,west,0);
 await crossShared(guest,bronze.entry,code);
 await guest.route.count(bronze.quest,2);
 await enterIndividually(players,bronze);
 const bronzeProof=await fightAndSave(players,bronze);
 await rematch(players,bronze);
 await leaveArena(players,bronze);
 await Promise.all(players.map(async player=>{
  await player.route.cross(shore);
  assert.equal((await player.route.actor()).y,414);
  const {coop}=await frame(player.page);
  assert.ok(!coop.shared&&coop.code===code);
  await crossShared(player,reef,code);
 }));
 await verifySavedReports(players,cases);
 const routes=players.map(p=>p.route.journeys);
 await Promise.all(players.map(p=>p.context.close()));
 return {infinitesimal:{...smallProof,returnY:small.returnY,sharedRematch:true},
  bronzelock:{...bronzeProof,returnY:bronze.returnY,sharedRematch:true},
  routes,personalDeviceProgress:true,independentSpiritwayAccess:true,sameRoomAcrossSpiritway:true,
  bothReported:true,reportRestoredForBoth:true};
}

async function solveNodRoute(player,cfg){
 const {page,route}=player;
 const {itinerary}=graph.quests.find(q=>q.id===cfg.quest);
 for(const [index,step] of itinerary.entries()){
  await route.walk(step.x);
  await route.changeHeight(step.y);
  if(step.reflect){
   for(const face of step.reflect.faces.slice(0,step.reflect.align-1)){
    await page.keyboard.press('KeyG');
    await wait(page,label=>window.lab.frame.storyReflection?.orientation===label,face.label);
   }
  }
  await page.keyboard.press('KeyG');
  await route.count(cfg.quest,index+1);
 }
}

async function nodFirstJourney(){
 const first={...cases[0],quests:cases.map(cfg=>cfg.quest)};
 const players=await Promise.all([start(first,false),start(first,false)]);
 const [host,guest]=players;
 const code=await createRoom(players);
 const proof={};
 for(const [index,cfg] of cases.entries()){
  await Promise.all(players.map(async player=>{
   if(index>0){
    await player.route.warp(cfg.approach);
    assert.equal((await frame(player.page)).coop.code,code);
   }
   for(const id of cfg.stops) await crossShared(player,id,code);
  }));
  await solveNodRoute(host,cfg);
  if(cfg.tag==='crab-tsar'){
   const hasBridge=f=>Object.values(f.platforms).some(p=>p.y===409&&p.x===1020&&p.moonDeck);
   assert.ok(hasBridge(await frame(host.page)));
   assert.ok(!hasBridge(await frame(guest.page)));
   await host.route.walk(1220);
   await host.route.changeHeight(409);
   await capture(host.page,'crab-tsar-bridge');
  }
  await crossShared(host,cfg.arena,code);
  assert.equal(await guest.route.node(),cfg.entry);
  await guest.route.count(cfg.quest,0);
  await wait(guest.page,arena=>window.lab.frame.coop?.peers[0]?.map===arena,cfg.arena);
  if(cfg.lock) await lockedNatlanGate(guest,cfg);
  await solveNodRoute(guest,cfg);
  await crossShared(guest,cfg.arena,code);
  const result=await fightAndSave(players,cfg);
  await rematch(players,cfg);
  await leaveArena(players,cfg);
  proof[cfg.tag]={...result,returnY:cfg.returnY,personalQuestGate:true,sharedRematch:true};
  console.log('Chrome: both players cleared '+cfg.tag+' and verified the return route.');
 }
 await verifySavedReports(players,cases);
 const routes=players.map(p=>p.route.journeys);
 await Promise.all(players.map(p=>p.context.close()));
 return {...proof,routes,personalMirrorBridge:true,sharedRoomAcrossRoutes:true,
  allThreeReportsRestoredForBoth:true};
}

async function visitNodNorth(player,cfg,approach,order,code){
 const {page,route}=player;
 if(await route.node()!==approach) await route.warp(approach);
 assert.equal((await frame(page)).coop.code,code);
 await crossShared(player,cfg.entry,code);
 await climb(route,cfg.shelves);
 if(order.includes(cfg.leg)) return;
 const survey=graph.quests.find(q=>q.id===cfg.quest);
 await collectSpot(player,survey.paths.find(path=>path.id===cfg.leg).steps[0]);
 await wait(page,({quest,leg})=>window.lab.frame.story.quests[quest].pathProgress[leg].count===1,
  {quest:cfg.quest,leg:cfg.leg});
 order.push(cfg.leg);
 await route.count(cfg.quest,Number(order.length===survey.paths.length));
}

async function nodNorthJourney(){
 const [coast,peninsula,wolf]=cases;
 const players=await Promise.all([start(coast,false),start(coast,false)]);
 const [host,guest]=players;
 const code=await createRoom(players);
 const orders=[[],[]], proof={};
 await visitNodNorth(guest,wolf,wolf.approach,orders[1],code);
 const untouched=(await frame(host.page)).story.quests[wolf.quest];
 assert.equal(untouched.count,0);
 assert.ok(Object.values(untouched.pathProgress).every(path=>path.count===0));
 await crossShared(guest,wolf.approach,code);

 for(const cfg of cases){
  const approaches=[cfg.approach,cfg.alternate??cfg.approach];
  await Promise.all(players.map((player,index)=>visitNodNorth(player,cfg,approaches[index],orders[index],code)));
  await enterIndividually(players,cfg);
  const result=await fightAndSave(players,cfg);
  await rematch(players,cfg);
  await leaveArena(players,cfg);
  proof[cfg.tag]={...result,returnY:cfg.returnY,sharedRematch:true};
  await Promise.all(players.map(async (player,index)=>{
   if(cfg===coast) await climb(player.route,[[640,411],[365,340]]);
   await crossShared(player,approaches[index],code);
  }));
  console.log('Chrome: both players cleared '+cfg.tag+' and verified the return route.');
 }
 await verifySavedReports(players,cases);
 const routes=players.map(p=>p.route.journeys);
 assert.notDeepEqual(orders[0],orders[1]);
 assert.ok(routes.every((route,index)=>route.some(leg=>leg[0]===[peninsula.approach,peninsula.alternate][index]&&leg[1]===peninsula.entry)));
 await Promise.all(players.map(p=>p.context.close()));
 return {...proof,routes,surveyOrders:orders,personalSurveyProgress:true,peninsulaEntrances:2,reportRestoredForBoth:true};
}

async function crossPrivate({route,page},id,code){
 await route.cross(id);
 const {coop}=await frame(page);
 assert.ok(coop.code===code&&!coop.shared&&coop.map===id);
}

async function winSparring({route,page},quest,count){
 await route.walk(787);
 await page.keyboard.down('KeyJ');
 try{await route.count(quest,count)}
 finally{await page.keyboard.up('KeyJ')}
}

async function snezFirstJourney(){
 const [churin,bandersnatch,furiosa]=cases;
 const first={...churin,quests:[churin.quest,bandersnatch.quest]};
 const players=await Promise.all([start(first,false),start(first,false)]);
 const [host,guest]=players;
 const code=await createRoom(players);
 const guide=graph.quests.find(q=>q.id===churin.quest).itinerary[0];
 await Promise.all(players.map(async player=>{
  await crossShared(player,churin.square,code);
  await collectSpot(player,guide);
  await player.route.count(churin.quest,1);
  await crossPrivate(player,churin.firstBout,code);
 }));
 await winSparring(host,churin.quest,2);
 await guest.route.count(churin.quest,1);
 assert.equal((await frame(guest.page)).total,1);
 await crossPrivate(host,churin.entry,code);
 await winSparring(host,churin.quest,3);
 await winSparring(guest,churin.quest,2);
 await crossPrivate(guest,churin.entry,code);
 await guest.route.count(churin.quest,2);
 await crossShared(host,churin.arena,code);
 assert.equal(await guest.route.node(),churin.entry);
 await guest.route.count(churin.quest,2);
 await winSparring(guest,churin.quest,3);
 await crossShared(guest,churin.arena,code);
 const churinProof=await fightAndSave(players,churin);
 await rematch(players,churin);
 await leaveArena(players,churin);
 await Promise.all(players.map(async player=>{
  assert.equal((await frame(player.page)).total,0);
  await crossPrivate(player,churin.firstBout,code);
  assert.equal((await frame(player.page)).total,0);
  await player.route.warp(bandersnatch.approach);
  await crossShared(player,bandersnatch.entry,code);
 }));
 console.log('Chrome: both players cleared Churin after their own sparring rounds.');

 const {itinerary}=graph.quests.find(q=>q.id===bandersnatch.quest);
 for(const step of itinerary) await collectSpot(host,step);
 await host.route.count(bandersnatch.quest,2);
 await crossShared(host,bandersnatch.arena,code);
 await lockedNatlanGate(guest,bandersnatch);
 await guest.route.count(bandersnatch.quest,0);
 for(const step of itinerary) await collectSpot(guest,step);
 await guest.route.count(bandersnatch.quest,2);
 await crossShared(guest,bandersnatch.arena,code);
 const bandersnatchProof=await fightAndSave(players,bandersnatch);
 await rematch(players,bandersnatch);
 await leaveArena(players,bandersnatch);
 console.log('Chrome: both players opened the ice door and cleared Bandersnatch.');

 await Promise.all(players.map(async player=>{
  await player.route.warp(furiosa.approach);
  await crossShared(player,furiosa.entry,code);
 }));
 await crossShared(guest,furiosa.domain,code);
 await crossShared(guest,furiosa.entry,code);
 await enterIndividually(players,furiosa);
 const furiosaProof=await fightAndSave(players,furiosa);
 await rematch(players,furiosa);
 await leaveArena(players,furiosa);
 await verifySavedReports(players,cases);
 const routes=players.map(p=>p.route.journeys);
 assert.ok(!routes[0].some(leg=>leg.includes(furiosa.domain)));
 assert.ok(routes[1].some(leg=>leg[0]===furiosa.domain&&leg[1]===furiosa.entry));
 await Promise.all(players.map(p=>p.context.close()));
 return {churin:{...churinProof,returnY:churin.returnY,sharedRematch:true},
  bandersnatch:{...bandersnatchProof,returnY:bandersnatch.returnY,sharedRematch:true},
  furiosa:{...furiosaProof,returnY:furiosa.returnY,sharedRematch:true},routes,
  separateSparringAndIceDoor:true,clearedRoundsStayEmpty:true,twoSnowfieldEntrances:true,reportRestoredForBoth:true};
}

async function inspectQuestSteps(player,quest,first,last){
 const {itinerary}=graph.quests.find(q=>q.id===quest);
 for(let index=first;index<last;index++){
  await collectSpot(player,itinerary[index]);
  await player.route.count(quest,index+1);
 }
}

async function snezLateJourney(){
 const [mouse,tree]=cases;
 const players=await Promise.all([start(mouse,false),start(mouse,false)]);
 const [host,guest]=players;
 const code=await createRoom(players);
 await Promise.all(players.map(player=>crossShared(player,mouse.entry,code)));
 await inspectQuestSteps(guest,mouse.quest,0,2);
 await inspectQuestSteps(host,mouse.quest,0,4);
 await crossShared(host,mouse.arena,code);
 await lockedNatlanGate(guest,mouse);
 await guest.route.count(mouse.quest,2);
 await inspectQuestSteps(guest,mouse.quest,2,4);
 await crossShared(guest,mouse.arena,code);
 const mouseProof=await fightAndSave(players,mouse);
 await rematch(players,mouse);
 await leaveArena(players,mouse);
 console.log('Chrome: both players rescued their own mice and cleared Ancient Ironquill.');

 await Promise.all(players.map(async player=>{
  for(const id of [mouse.approach,'sne-north-works','sne-wp-106192','sne-wp-106206',tree.checkpoint]){
   await crossShared(player,id,code);
  }
  await player.route.accept(tree.quest);
  for(const id of ['sne-wp-106204','sne-wp-106183','sne-wp-106220',tree.approach,tree.junction]){
   await crossShared(player,id,code);
  }
 }));
 await inspectQuestSteps(host,tree.quest,0,1);
 await crossShared(host,tree.entry,code);
 await lockedNatlanGate(guest,{arena:tree.entry,lock:'水位表'});
 await guest.route.count(tree.quest,0);
 await inspectQuestSteps(guest,tree.quest,0,1);
 await crossShared(guest,tree.entry,code);
 await inspectQuestSteps(host,tree.quest,1,2);
 await crossShared(host,tree.arena,code);
 await lockedNatlanGate(guest,tree);
 await guest.route.count(tree.quest,1);
 await inspectQuestSteps(guest,tree.quest,1,2);
 await crossShared(guest,tree.arena,code);
 const treeProof=await fightAndSave(players,tree);
 await rematch(players,tree);
 await leaveArena(players,tree);
 await verifySavedReports(players,cases);
 const routes=players.map(p=>p.route.journeys);
 await Promise.all(players.map(p=>p.context.close()));
 return {ancientMouse:{...mouseProof,returnY:mouse.returnY,sharedRematch:true},
  calamitousTree:{...treeProof,returnY:tree.returnY,sharedRematch:true},routes,
  personalMouseRescues:true,personalWaterwayGates:true,sharedRoomViaNorthWorks:true,bothReportsRestored:true};
}

async function dornSkyJourney(){
 const [chur,maha]=cases;
 const players=await Promise.all([start(chur,false),start(chur,false)]);
 const [host,guest]=players;
 const code=await createRoom(players);
 await Promise.all(players.map(async player=>{
  for(const id of ['mond-wp-95782','mond-wp-95795','mond-wp-95794','mond-wp-95793','mond-wp-95792',chur.entry]){
   await crossShared(player,id,code);
  }
 }));
 await enterIndividually(players,chur);
 const churProof=await fightAndSave(players,chur);
 await rematch(players,chur);
 await leaveArena(players,chur);
 console.log('Chrome: both players crossed the bay and cleared Churldric.');
 await Promise.all(players.map(async player=>{
  await player.route.warp(maha.checkpoint);
  assert.equal((await frame(player.page)).coop.code,code);
  await player.route.accept(maha.quest);
  await player.route.warp(maha.approach);
  await crossShared(player,maha.entry,code);
 }));
 await inspectQuestSteps(guest,maha.quest,0,2);
 await inspectQuestSteps(host,maha.quest,0,3);
 await crossShared(host,maha.arena,code);
 await lockedNatlanGate(guest,maha);
 await guest.route.count(maha.quest,2);
 await inspectQuestSteps(guest,maha.quest,2,3);
 await crossShared(guest,maha.arena,code);
 const mahaProof=await fightAndSave(players,maha);
 await rematch(players,maha);
 await leaveArena(players,maha);
 await Promise.all(players.map(async player=>{
  await crossShared(player,maha.approach,code);
  assert.equal((await player.route.actor()).y,365);
 }));
 await verifySavedReports(players,cases);
 const routes=players.map(p=>p.route.journeys);
 assert.ok(routes.every(route=>route.some(leg=>leg[0]==='mond-wp-95794'&&leg[1]==='mond-wp-95793'&&leg[2]==='boat')));
 await Promise.all(players.map(p=>p.context.close()));
 return {churldric:{...churProof,returnY:chur.returnY,sharedRematch:true},
  maha:{...mahaProof,returnY:maha.returnY,sharedRematch:true},routes,
  sharedBayCrossing:true,personalPavilionSurvey:true,templeLiftReturnY:365,reportRestoredForBoth:true};
}

try{
 const evidence={participants:2,...(artSource?{artSource}: {})};
 if(dornSky) Object.assign(evidence,await dornSkyJourney());
 else if(snezLate) Object.assign(evidence,await snezLateJourney());
 else if(snezFirst) Object.assign(evidence,await snezFirstJourney());
 else if(nodNorth) Object.assign(evidence,await nodNorthJourney());
 else if(nodFirst) Object.assign(evidence,await nodFirstJourney());
 else if(highland) Object.assign(evidence,await highlandJourney());
 else if(finalNatlan) Object.assign(evidence,await finalNatlanJourney());
 else if(atocpan) Object.assign(evidence,await atocpanJourney());
 else if(wayob) Object.assign(evidence,await wayobJourney());
 else for(const cfg of cases)evidence[cfg.tag]=await scenario(cfg);
 assert.deepEqual(errors,[]);
 await fs.writeFile(prefix+'-browser.json',JSON.stringify({...evidence,errors},null,2)+'\n');
 console.log(`Chrome: ${cases.length} Local Legends share warnings, combat, personal rewards, and a fresh rematch.`);
}catch(error){
 const status=await Promise.allSettled(pages.map(p=>p.evaluate(()=>{
  const f=window.lab.frame;
  return {node:f?.story?.node,t:f?.t,boss:f?.fieldBoss,coop:f?.coop?.map,
   actors:f?.actors?.map(a=>[a.x,a.y,a.hp,a.dir]),result:window.branchLegendResult,
   status:document.querySelector('#status')?.textContent};
 })));
 console.error(JSON.stringify({status,errors},null,2));
 throw error;
}finally{
 await browser.close();
}
