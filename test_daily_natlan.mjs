import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {chromium} from 'playwright';

const hub='natlan-hub', ridge='natlan-field', quarry='natlan-quarry-road', river='natlan-riverside-range';
const training='daily-nat-training', circuit='daily-nat-ridge', mining='daily-nat-quarry';
const riverside='daily-nat-riverside', elites='daily-nat-elite-hunt';
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1280,height:980}});
const board=page.locator('#dailyBoard'), canvas=page.locator('#game'), errors=[];
page.on('pageerror',error=>errors.push(error.message));
const wait=(fn,arg)=>page.waitForFunction(fn,arg,{timeout:26000});
const frame=()=>page.evaluate(()=>window.lab.frame);
const card=(id,mode)=>page.locator(`[data-daily-id="${id}"][data-daily-mode="${mode}"]`);
const button=(id,mode)=>card(id,mode).getByRole('button');
const at=node=>wait(id=>window.lab?.frame.story?.node===id,node);
const shot=(name,element=board)=>element.screenshot({path:`evidence/daily-nat-${name}.png`});
const counts=async()=>Object.fromEntries((await frame()).daily.activeSlots.map(q=>[q.id,q.count]));

async function openBoard(){
 if(!await board.evaluate(node=>node.open))await board.locator('summary').click();
}

async function held(code,predicate,arg){
 await canvas.click();
 await page.keyboard.down(code);
 try{await wait(predicate,arg)}finally{await page.keyboard.up(code)}
}

async function move(x){
 const f=await frame(),position=f.actors[f.active-1].x;
 if(Math.abs(position-x)<8)return;
 const right=position<x;
 await held(right?'KeyD':'KeyA',({x,right})=>{
  const f=window.lab.frame,p=f.actors[f.active-1].x;
  return right?p>=x-5:p<=x+5;
 },{x,right});
}

async function gate(x,node){
 await move(x);
 await wait(id=>window.lab.frame.storyNearbyPortal?.to===id&&window.lab.frame.storyNearbyPortal.available,node);
 await canvas.click();
 await page.keyboard.press('KeyF');
 await at(node);
}

async function load(snapshot){
 await page.evaluate(s=>localStorage.setItem('maple-lua-lab.checkpoint.v1',s),JSON.stringify(snapshot));
 const {session}=await frame();
 const restore=page.waitForResponse(res=>res.url().endsWith('/api/frame')&&!!res.request().postDataJSON()?.restore);
 await page.locator('#loadProgress').click();
 const response=await restore;
 if(!response.ok())throw new Error(await response.text());
 await wait(old=>window.lab.frame.session!==old,session);
 await at(hub);
}

async function fixture(name,period){
 const snapshot=JSON.parse(await fs.readFile(`work/daily-nat-${name}-fixture.json`,'utf8'));
 snapshot.daily.profile=randomUUID().replaceAll('-','');
 snapshot.daily.ledger.period=period;
 return snapshot;
}

async function enterQuarry(){
 await gate(1380,quarry);
}

async function leaveQuarry(){
 await gate(1610,hub);
}

async function hitToAdvance(id){
 await held('KeyJ',id=>window.lab.frame.daily.activeSlots.find(q=>q.id===id).count>0,id);
}

try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8936/');
 await wait(()=>window.lab?.frame);
 await page.getByRole('button',{name:'本編ルートへ',exact:true}).click();
 await at('mond-town');
 await wait(()=>Number.isInteger(window.lab.frame.daily?.period));
 const period=(await frame()).daily.period;
 const start=await fixture('level',period);
 await load(start);
 await openBoard();
 await card(mining,'offer').waitFor();
 assert.equal(await board.locator('[data-daily-mode="offer"]').count(),5);
 await shot('offers');
 for(const id of [training,riverside,mining])await button(id,'offer').click();
 await wait(()=>window.lab.frame.daily.activeSlots.length===3);
 assert.ok(await button(elites,'offer').isDisabled());
 await gate(280,river);
 await move(265);
 await hitToAdvance(riverside);
 const riverCounts=await counts();
 assert.equal(riverCounts[mining],0);
 assert.equal(riverCounts[training],riverCounts[riverside]);
 await move(588);
 await wait(()=>window.lab.frame.storyElite?.name==='浅瀬道を守る帆殻の魔物');
 await shot('river',page.locator('.game'));
 await gate(62,hub);
 const afterRiver=await counts();
 await enterQuarry();
 await move(290);
 await hitToAdvance(mining);
 assert.equal((await counts())[riverside],afterRiver[riverside]);
 await move(681);
 await wait(()=>window.lab.frame.storyElite?.name==='採掘路に居座る牙獣');
 await shot('quarry',page.locator('.game'));
 const popupPromise=page.waitForEvent('popup');
 await page.getByRole('link',{name:'この地点の配置比較を開く',exact:true}).click();
 const popup=await popupPromise;
 popup.on('pageerror',error=>errors.push(error.message));
 await popup.waitForFunction(()=>window.mapArt?.ready);
 assert.equal(await popup.locator('#node').inputValue(),quarry);
 for(const [location,expectedCount,asset,expectedSpecies] of [
  [quarry,18,'fanged-beast',6],[river,17,'sail-shell-crawler',7]
 ]){
  await popup.selectOption('#node',location);
  await popup.click('#loadLive');
  await popup.waitForFunction(count=>window.mapArt.count===count,expectedCount);
  for(const profile of ['legacy','h48c32','h32c16']){
   await popup.selectOption('#profile',profile);
   const comparison=await popup.evaluate(()=>window.mapArt);
   assert.ok(comparison.grounded&&comparison.backgroundState==='ready');
   assert.equal(comparison.placements.filter(enemy=>enemy.species===asset).length,expectedSpecies);
  }
 }
 await popup.close();
 await leaveQuarry();
 const lastCounts=await counts();
 await load(start);
 assert.deepEqual(await counts(),lastCounts);

 const ready=await fixture('ready',period);
 for(const slot of ready.daily.ledger.activeSlots)slot.count--;
 await load(ready);
 await enterQuarry();
 await move(290);
 await held('KeyJ',()=>window.lab.frame.daily.activeSlots.every(q=>q.count===q.goal));
 await leaveQuarry();
 await openBoard();
 const before=await frame();
 for(const id of [training,circuit,mining]){
  await button(id,'active').click();
  await wait(id=>window.lab.frame.daily.activeSlots.find(q=>q.id===id)?.claimed,id);
 }
 const after=await frame();
 const reward={xp:after.progression.questXp-before.progression.questXp,mora:after.mora-before.mora};
 assert.deepEqual(reward,{xp:586230,mora:6950});
 await shot('claimed');
 await page.setViewportSize({width:390,height:844});
 assert.ok(await board.evaluate(node=>node.getBoundingClientRect().right<=390&&node.scrollWidth<=node.clientWidth));
 await load(ready);
 const older=await frame();
 assert.ok(older.daily.activeSlots.every(q=>q.claimed));
 assert.equal(older.progression.questXp,after.progression.questXp);
 assert.equal(older.mora,ready.mora+reward.mora);
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/daily-nat-web.json',JSON.stringify({
  townOffers:5,walkedBothFieldsAndReturned:true,normalAttacksCountAtCorrectArea:true,
  namedElitesInBothFields:true,threeQuarryObjectivesOverlap:true,mapPlacementComparisonProfiles:3,
  staleSaveRetainsProgress:true,rewardsDoNotReplay:true,mobileFits:true,reward,errors
 },null,2)+'\n');
 console.log('Natlan: Chrome walking, quarry and river kills, placement comparison, restore and claims passed');
}catch(error){
 const current=await frame();
 console.error({node:current?.story?.node,position:current?.actors?.[0]?.x,elite:current?.storyElite,
  slots:current?.daily?.activeSlots,portal:current?.storyNearbyPortal,
  save:await page.locator('#saveStatus').textContent(),errors});
 await page.screenshot({path:'work/daily-nat-failure.png'});
 throw error;
}finally{
 await browser.close();
}
