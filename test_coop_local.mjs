import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const url=process.env.LAB_URL||'http://127.0.0.1:8993/';
const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const nodes=Object.fromEntries(graph.nodes.map(node=>[node.id,node]));
const browser=await chromium.launch({headless:true,channel:'chrome'});
const errors=[];
const saveKey='maple-lua-lab.checkpoint.v1';

async function start(){
 const context=await browser.newContext({viewport:{width:1240,height:920}});
 const page=await context.newPage();
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto(url);
 await page.waitForFunction(()=>window.lab?.frame);
 await page.evaluate(()=>window.lab.action('story_start'));
 const travel=waypointDriver(page,nodes);
 await travel.waitNode('mond-town');
 await travel.cross('mond-road');
 await page.locator('#coopPanel summary').click();
 return {page,travel};
}

try{
 const [host,guest]=await Promise.all([start(),start()]);
 const a=host.page,b=guest.page;
 await a.locator('#coopCreate').click();
 await a.waitForFunction(()=>window.lab.frame.coop?.code);
 const code=await a.evaluate(()=>window.lab.frame.coop.code);
 await b.locator('#coopCode').fill(code.toLowerCase());
 await b.locator('#coopJoin').click();
 await b.waitForFunction(()=>window.lab.frame.coop?.peers?.length===1);
 await a.waitForFunction(()=>window.lab.frame.coop?.peers?.length===1);
 assert.match(await a.locator('#coopState').textContent(),/参加中 2 \/ 2人/);
 assert.equal(await a.locator('#pause').isDisabled(),true);
 assert.equal(await a.locator('#coopSetup').isHidden(),true);
 assert.equal(await a.evaluate(()=>window.lab.frame.coop.enemies.length),6);

 const before=await host.travel.actor();
 await host.travel.walk(235);
 await b.waitForFunction(start=>window.lab.frame.coop.peers[0].actors[0].x>start+40,before.x);
 assert.equal(await b.evaluate(()=>window.lab.frame.coop.peers[0].actors.length),2);
 await b.evaluate(()=>document.activeElement.blur());
 await b.keyboard.press('KeyM');
 await b.waitForFunction(()=>window.lab.frame.worldMap);
 const tick=await b.evaluate(()=>window.lab.frame.coop.tick);
 await a.waitForFunction(tick=>window.lab.frame.coop.tick>tick+12,tick);
 await b.keyboard.press('Escape');
 await b.waitForFunction(()=>!window.lab.frame.worldMap);

 const kills=await a.evaluate(()=>window.lab.frame.kills);
 await guest.travel.walk(430);
 await host.travel.walk(440);
 await a.evaluate(()=>document.activeElement.blur());
 await a.keyboard.down('KeyJ');
 try{
  await a.waitForFunction(kills=>window.lab.frame.kills>kills&&window.lab.frame.coop.enemies.some(enemy=>enemy.hp===0),
   kills,{timeout:12000});
 }finally{await a.keyboard.up('KeyJ')}
 const snapshot=await a.evaluate(()=>window.lab.frame.coop.enemies.map(enemy=>enemy.hp));
 await b.waitForFunction(snapshot=>snapshot.some((hp,index)=>hp===0&&window.lab.frame.coop.enemies[index].hp===0),snapshot,
  {timeout:8000});
 await guest.travel.walk(290);
 assert(await a.evaluate(()=>window.lab.frame.draws.some(draw=>draw.kind==='text'&&draw.text==='旅人 2')));
 await a.locator('#game').screenshot({path:'evidence/coop-local-browser.png'});
 const guestState=await b.evaluate(()=>({slot:window.lab.frame.coop.slot,kills:window.lab.frame.kills}));
 await b.reload();
 await b.waitForFunction(slot=>window.lab?.frame.coop?.slot===slot,guestState.slot);
 assert.equal(await b.evaluate(()=>window.lab.frame.kills),guestState.kills);
 await b.locator('#saveProgress').click();
 await b.waitForFunction(saveKey=>Boolean(JSON.parse(localStorage.getItem(saveKey))?.story),saveKey);
 const saved=await b.evaluate(saveKey=>JSON.parse(localStorage.getItem(saveKey)),saveKey);
 assert.equal(saved.story.node,'mond-road');

 await b.setViewportSize({width:390,height:844});
 await b.locator('#coopPanel summary').click();
 const mobileFits=await b.locator('#coopPanel').evaluate(el=>el.scrollWidth<=el.clientWidth+1);
 assert(mobileFits);
 await b.locator('#coopLeave').click();
 await a.waitForFunction(()=>window.lab.frame.coop.peers.length===0);
 assert.equal(await b.locator('#coopCreate').isEnabled(),true);
 assert.deepEqual(errors,[]);

 await fs.writeFile('evidence/coop-local-browser.json',JSON.stringify({
  twoBrowserProfiles:true,realRouteToRoad:true,actorsVisibleFromOtherBrowser:2,
  sharedDefeat:true,atlasKeepsRoomClockRunning:true,reloadKeepsSlot:true,
  saveInRoom:true,leaveVisibleToPeer:true,mobileFits,errors
 },null,2)+'\n');
 console.log('Chrome: movement, shared defeat, map, reload, save, mobile and departure passed.');
}finally{
 await browser.close();
}
