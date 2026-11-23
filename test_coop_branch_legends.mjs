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
const localNatlan=natlan||night||north||cliff||northwest;
const prefix=northwest?'evidence/coop-natlan-northwest-legends':cliff?'evidence/coop-natlan-cliff-trials'
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
const cases=northwest?northwestCases:cliff?cliffCases:north?northCases:night?nightCases:natlan?natlanCases:dry?dryCases:lake?[
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
 const fixturePath=northwest?'work/natlan-northwest-legends-fixture.json':cliff?'work/natlan-cliff-trials-fixture.json'
  : north?'work/natlan-north-trials-fixture.json':night?'work/natlan-night-trial-fixture.json'
  : natlan?'work/coop-natlan-entry-legends-fixture.json':'work/coop-'+cfg.arena+suffix;
 const fixture=await fs.readFile(fixturePath,'utf8');
 const port=localNatlan?9068:dry?9064:lake?9063:9060;
 await page.goto(process.env.LAB_URL||`http://127.0.0.1:${port}/`);
 await wait(page,()=>window.lab?.frame);
 await page.evaluate(([key,fixture])=>localStorage.setItem(key,fixture),[key,fixture]);
 await page.locator('#loadProgress').click();
 await route.waitNode(cfg.checkpoint);
 if(localNatlan && cfg.quest) await route.accept(cfg.quest);
 await route.warp(cfg.approach??cfg.entry);
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

async function verifyNatlanSave(players,cfg){
 await Promise.all(players.map(async ({page,route})=>{
  await page.reload();
  await wait(page,()=>window.lab?.frame);
  await page.locator('#loadProgress').click();
  await wait(page,()=>document.querySelector('#saveStatus').textContent.includes('町から再開しました'));
  await route.waitNode(cfg.checkpoint);
  if(cfg.quest){
   const quest=graph.quests.find(q=>q.id===cfg.quest);
   const before=await frame(page);
   await route.report(cfg.quest);
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

async function scenario(cfg){
 pages=[];
 const players=await Promise.all([start(cfg,false),start(cfg,Boolean(cfg.quest))]);
 const [a,b]=players.map(p=>p.page);
 await a.locator('#coopCreate').click();
 await wait(a,()=>window.lab.frame.coop?.code);
 const code=(await frame(a)).coop.code;
 await b.locator('#coopCode').fill(code);
 await b.locator('#coopJoin').click();
 await wait(b,c=>window.lab.frame.coop?.code===c,code);
 if(northwest) await prepareNorthwestTrial(players,cfg);
 if(cfg.phase){
  if(cliff) await prepareCliffTrial(players,cfg);
  else if(north) await prepareNorthTrial(players,cfg);
  else if(!northwest) await Promise.all(players.map(p=>p.route.cross(cfg.entry)));
  await players[0].route.cross(cfg.arena);
  assert.equal(await players[1].route.node(),cfg.entry);
  await wait(b,arena=>window.lab.frame.coop?.peers[0]?.map===arena,cfg.arena);
  await players[1].route.cross(cfg.arena);
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
 await Promise.all(players.map(p=>p.route.cross(cfg.entry)));
 if(cliff||northwest){
  const returned=await Promise.all(players.map(p=>frame(p.page)));
  assert.ok(returned.every(f=>f.actors[0].y===cfg.returnY));
  if(cfg.travelerOnly) assert.ok(returned.every(f=>!f.storyTravelerTrial&&f.active===2&&f.actors[1].hp>0));
 }
 await Promise.all(players.map(p=>p.route.cross(cfg.arena)));
 const restart=await Promise.all(players.map(p=>frame(p.page)));
 assert.ok(restart.every(f=>f.coop.enemies[0]?.hp===cfg.hp));
 if(localNatlan) await verifyNatlanSave(players,cfg);
 await Promise.all(players.map(p=>p.context.close()));
 return {results,warnings: warnings[0],rewards,contacts,saved:true,sharedRematch:true,
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

try{
 const evidence={participants:2,...(artSource?{artSource}: {})};
 for(const cfg of cases)evidence[cfg.tag]=await scenario(cfg);
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
