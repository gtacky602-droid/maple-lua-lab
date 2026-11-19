import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const url = process.env.LAB_URL || 'http://127.0.0.1:9001/';
const anemo = 'anemo-field-basin', electro = 'electro-field-shelf';
const quest = 'electro-commission', boss = 'boss-20040101';
const saveKey = 'maple-lua-lab.checkpoint.v1';
const fixture = JSON.parse(await fs.readFile('work/electro-hypostasis-field-fixture.json','utf8'));
const graph = JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const nodes = Object.fromEntries(graph.nodes.map(node => [node.id,node]));
const browser = await chromium.launch({channel:'chrome',headless:true});
const errors = [];

async function start(accept) {
 const context = await browser.newContext({viewport:{width:1220,height:940}});
 const page = await context.newPage();
 page.setDefaultTimeout(20000);
 page.on('pageerror',error => errors.push(error.message));
 await page.goto(url);
 await page.waitForFunction(() => window.lab?.frame);
 const save = structuredClone(fixture);
 if(!accept) delete save.story.quests[quest];
 await page.evaluate(([key,data]) => localStorage.setItem(key,JSON.stringify(data)),[saveKey,save]);
 await page.locator('#loadProgress').click();
 await page.waitForFunction(() => window.lab.frame.progression?.level === 18);
 await page.locator('#coopPanel summary').click();
 return {page,travel:waypointDriver(page,nodes,{walkTimeout:18000})};
}

async function fight(page) {
 await page.evaluate(() => {
  document.activeElement.blur();
  const held = new Set(), moves = new Set();
  const triggers = {FE01:[62,122,189],FE02:[79],FE03:[78,150]};
  const start = window.lab.frame;
  let used = new Set(), previous = '', lastTick = -1, jumpUntil = 0;
  function hold(code,pressed) {
   if(held.has(code)===pressed) return;
   if(pressed) held.add(code);
   else held.delete(code);
   window.dispatchEvent(new KeyboardEvent(pressed?'keydown':'keyup',{code,bubbles:true,cancelable:true}));
  }
  function tick() {
   const f=window.lab.frame, a=f.actors[f.active-1], b=f.fieldBoss;
   if(!f.coop?.code || b?.hp===0 || f.t-start.t>100) {
    for(const code of [...held]) hold(code,false);
    window.coopElectro={seconds:f.t-start.t,hp:a.hp,moves:[...moves],kills:f.kills-start.kills,damage:f.damage-start.damage};
    return;
   }
   if(!b) {
    hold('KeyD',true);
    requestAnimationFrame(tick);
    return;
   }
   if(b.move!==previous || b.tick<lastTick) {
    used=new Set();
    previous=b.move;
   }
   lastTick=b.tick;
   if(b.move) moves.add(b.move);
   if(a.ground) for(const at of triggers[b.move]||[]) {
    if(b.tick>=at&&b.tick<at+7&&!used.has(at)) { used.add(at); jumpUntil=f.t+.68; }
   }
   hold('Space',f.t<jumpUntil);
   const dx=b.x-a.x, side=dx>=0?-1:1, dist=Math.abs(dx), turn=a.dir===side;
   const toward=dist>112||(turn&&dist>=105), away=dist<98||(turn&&dist<105);
   hold('KeyA',side===1?toward:away);
   hold('KeyD',side===-1?toward:away);
   hold('KeyJ',dist<125&&!turn);
   requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
 });
}

try {
 const [host,guest] = await Promise.all([start(true),start(false)]);
 const a=host.page,b=guest.page;
 await a.locator('#coopCreate').click();
 await a.waitForFunction(() => window.lab.frame.coop?.code);
 const [code,hostSlot] = await a.evaluate(() => [window.lab.frame.coop.code,window.lab.frame.coop.slot]);
 await b.locator('#coopCode').fill(code);
 await b.locator('#coopJoin').click();
 await b.waitForFunction(code=>window.lab.frame.coop?.code===code,code);
 await Promise.all([
  (async()=>{ for(const node of ['mond-road','anemo-approach',anemo]) await host.travel.cross(node); })(),
  (async()=>{ for(const node of ['mond-road','electro-approach',electro]) await guest.travel.cross(node); })(),
 ]);
 await a.waitForFunction(node=>window.lab.frame.coop.peers[0].map===node,electro);
 const separated = await Promise.all([a,b].map(page => page.evaluate(() => ({
  maxHp:window.lab.frame.coop.enemies[0].maxhp, peerActors:window.lab.frame.coop.peers[0].actors.length,
 }))));
 assert.deepEqual(separated,[{maxHp:870,peerActors:0},{maxHp:900,peerActors:0}]);
 for(const node of ['anemo-approach','mond-road','electro-approach',electro]) await host.travel.cross(node);
 await a.waitForFunction(([code,slot]) => {
  const view=window.lab.frame.coop;
  return view.code===code && view.slot===slot && view.peers[0].actors.length===2;
 },[code,hostSlot]);
 await Promise.all([a,b].map(fight));
 await a.waitForFunction(() => {
  const b=window.lab.frame.fieldBoss;
  return b?.move==='FE02' && b.tick>=84 && b.tick<106;
 });
 const drill=await a.evaluate(() => window.lab.frame.fieldBoss);
 await a.locator('#game').screenshot({path:'evidence/coop-electro-browser.png'});
 await Promise.all([a,b].map(page => page.waitForFunction(() => window.coopElectro,null,{timeout:140000})));
 const results=await Promise.all([a,b].map(page=>page.evaluate(()=>window.coopElectro)));
 assert.ok(results.every(r=>r.kills===1 && r.damage>0 && r.hp>0),JSON.stringify(results));
 const counts=await Promise.all([a,b].map(page=>page.evaluate(q=>window.lab.frame.story.quests[q]?.count??null,quest)));
 assert.deepEqual(counts,[1,null]);
 const records=[];
 for(const page of [a,b]) {
  await page.locator('#saveProgress').click();
  await page.waitForFunction(([key,id])=>JSON.parse(localStorage.getItem(key))?.endgame?.bosses?.[id]?.clears===1,[saveKey,boss]);
  const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),saveKey);
  assert.equal(saved.fieldBosses[boss].hp,0);
  records.push(saved.endgame.bosses[boss].clears);
 }
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/coop-electro-browser.json',JSON.stringify({
  browser:'Chrome', separated, stableSlotFromAnemoToElectro:true, sharedDrillTick:drill.tick,
  results, personalQuestCounts:counts, savedClears:records, errors,
 },null,2)+'\n');
 console.log('Chrome profiles travelled between the boss arenas, cleared Electro and saved both records.');
} finally {
 await browser.close();
}
