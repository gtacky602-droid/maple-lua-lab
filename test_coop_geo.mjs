import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const url=process.env.LAB_URL||'http://127.0.0.1:9002/';
const entry='geo-approach', arena='geo-field-court', quest='geo-commission', boss='boss-20040301';
const saveKey='maple-lua-lab.checkpoint.v1', pillar='geo-pillar-source-v1.png';
const fixture=JSON.parse(await fs.readFile('work/geo-hypostasis-field-fixture.json','utf8'));
const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const nodes=Object.fromEntries(graph.nodes.map(node=>[node.id,node]));
const browser=await chromium.launch({channel:'chrome',headless:true});
const errors=[];
const screenshot=(page,suffix)=>page.locator('#game').screenshot({path:'evidence/coop-geo-'+suffix+'.png'});

async function start(accept) {
 const context=await browser.newContext({viewport:{width:1220,height:940}});
 const page=await context.newPage();
 page.setDefaultTimeout(22000);
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto(url);
 await page.waitForFunction(()=>window.lab?.frame);
 const save=structuredClone(fixture);
 if(!accept) delete save.story.quests[quest];
 await page.evaluate(([key,data])=>localStorage.setItem(key,JSON.stringify(data)),[saveKey,save]);
 await page.locator('#loadProgress').click();
 await page.waitForFunction(()=>window.lab.frame.story?.node==='liyue-harbor'&&window.lab.frame.progression?.level===32);
 const travel=waypointDriver(page,nodes,{walkTimeout:18000});
 await travel.cross('liyue-field');
 await travel.cross(entry);
 await page.locator('#coopPanel summary').click();
 return {page,travel};
}

const labels=['近くで柱に攻撃 0/3','近くで柱に攻撃 1/3','近くで柱に攻撃 2/3','柱破壊・核が静止'];
const waitLabel=(page,i)=>page.waitForFunction(label=>window.lab.frame.fieldBoss?.label===label,labels[i]);
async function strike(page,other,i) {
 await page.keyboard.down('KeyJ');
 try { await waitLabel(page,i); }
 finally { await page.keyboard.up('KeyJ'); }
 await waitLabel(other,i);
}

async function fight(page) {
 await page.evaluate(() => {
  document.activeElement.blur();
  const held=new Set(), moves=new Set();
  const triggers={FG01:[76],FG02:[61,106],FG03:[131]};
  const start=window.lab.frame;
  let used=new Set(), previous='', last=-1, jumpUntil=0;
  function hold(code,pressed) {
   if(held.has(code)===pressed) return;
   if(pressed) held.add(code);
   else held.delete(code);
   window.dispatchEvent(new KeyboardEvent(pressed?'keydown':'keyup',{code,bubbles:true,cancelable:true}));
  }
  function tick() {
   const f=window.lab.frame, b=f.fieldBoss, a=f.actors[f.active-1];
   if(!f.coop?.code||b?.hp===0||f.t-start.t>105) {
    for(const code of [...held]) hold(code,false);
    window.coopGeo={seconds:f.t-start.t,hp:a.hp,moves:[...moves],kills:f.kills-start.kills,damage:f.damage-start.damage};
    return;
   }
   if(!b) {
    hold('KeyD',true);
    requestAnimationFrame(tick);
    return;
   }
   if(b.move!==previous||b.tick<last) { previous=b.move; used=new Set(); }
   last=b.tick;
   if(b.move) moves.add(b.move);
   const exposed=b.label==='柱破壊・核が静止';
   if(a.ground&&!exposed) for(const at of triggers[b.move]||[]) {
    if(b.tick>=at&&b.tick<at+7&&!used.has(at)) { used.add(at); jumpUntil=f.t+.7; }
   }
   const dx=b.x-a.x, turn=a.dir<0;
   hold('Space',f.t<jumpUntil);
   hold('KeyA',dx<70||(turn&&dx<77));
   hold('KeyD',dx>84||(turn&&dx>=77));
   hold('KeyJ',dx>0&&dx<125&&!turn);
   requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
 });
}

try {
 const [host,guest]=await Promise.all([start(true),start(false)]);
 const a=host.page,b=guest.page;
 await a.locator('#coopCreate').click();
 await a.waitForFunction(()=>window.lab.frame.coop?.code);
 const code=await a.evaluate(()=>window.lab.frame.coop.code);
 await b.locator('#coopCode').fill(code);
 await b.locator('#coopJoin').click();
 await b.waitForFunction(code=>window.lab.frame.coop?.code===code,code);
 await Promise.all([host,guest].map(({travel})=>travel.cross(arena)));
 await a.waitForFunction(()=>window.lab.frame.coop.peers[0]?.actors.length===2&&window.lab.frame.coop.enemies[0].maxhp===980);
 await Promise.all([host,guest].map(({travel})=>travel.walk(731)));
 const before=await Promise.all([a,b].map(page=>page.evaluate(()=>window.lab.frame.kills)));
 await waitLabel(a,0);
 assert.ok(await a.evaluate(source=>window.lab.frame.draws.some(d=>d.source===source),pillar));
 await screenshot(a,'pillar');
 await Promise.all([host,guest].map(({travel})=>travel.walk(779)));
 await strike(a,b,1);
 await strike(b,a,2);
 await strike(a,b,3);
 for(const [i,page] of [a,b].entries()) {
  const view=await page.evaluate(source=>({
   label:window.lab.frame.fieldBoss.label,hasPillar:window.lab.frame.draws.some(d=>d.source===source),
   kills:window.lab.frame.kills,
  }),pillar);
  assert.deepEqual(view,{label:labels[3],hasPillar:false,kills:before[i]});
 }
 await screenshot(a,'exposed');
 await Promise.all([a,b].map(fight));
 await Promise.all([a,b].map(page=>page.waitForFunction(()=>window.coopGeo,null,{timeout:145000})));
 const results=await Promise.all([a,b].map(page=>page.evaluate(()=>window.coopGeo)));
 assert.ok(results.every(r=>r.kills===1&&r.hp>0&&r.damage>0),JSON.stringify(results));
 const personalQuestCounts=await Promise.all([a,b].map(page=>page.evaluate(q=>window.lab.frame.story.quests[q]?.count??null,quest)));
 assert.deepEqual(personalQuestCounts,[1,null]);
 for(const page of [a,b]) {
  await page.locator('#saveProgress').click();
  await page.waitForFunction(([key,id])=>JSON.parse(localStorage.getItem(key))?.endgame?.bosses?.[id]?.clears===1,[saveKey,boss]);
 }
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/coop-geo-browser.json',JSON.stringify({
  browser:'Chrome', participants:2, sharedMaxHp:980, pillarStruckBySlots:[1,2,1],
  bothSawEveryPillarCount:true, bothSawExposure:true, results, personalQuestCounts, savedClears:[1,1],errors,
 },null,2)+'\n');
 console.log('Chrome players exchanged three pillar hits, saw the same exposure, and saved both clears.');
} finally {
 await browser.close();
}
