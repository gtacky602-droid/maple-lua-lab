import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {chromium} from 'playwright';

const hub='inazuma-town', shore='inazuma-shore-hunt', liyue='liyue-harbor';
const cargo='daily-liyue-cargo', patrol='daily-ina-patrol', fireworks='daily-ina-firework-road';
const short='daily-ina-short-patrol', trial='daily-ina-trial', nobushi='daily-ina-nobushi';
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1280,height:980}});
const board=page.locator('#dailyBoard'), canvas=page.locator('#game'), errors=[];
page.on('pageerror',error=>errors.push(error.message));
const wait=(fn,arg)=>page.waitForFunction(fn,arg,{timeout:26000});
const frame=()=>page.evaluate(()=>window.lab.frame);
const card=(id,mode)=>page.locator(`[data-daily-id="${id}"][data-daily-mode="${mode}"]`);
const button=(id,mode)=>card(id,mode).getByRole('button');
const at=node=>wait(id=>window.lab?.frame.story?.node===id,node);
const shot=(name,element=board)=>element.screenshot({path:`evidence/daily-ina-${name}.png`});

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
 const snapshot=JSON.parse(await fs.readFile(`work/daily-ina-${name}-fixture.json`,'utf8'));
 snapshot.daily.profile=randomUUID().replaceAll('-','');
 snapshot.daily.ledger.period=period;
 return snapshot;
}

try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8933/');
 await wait(()=>window.lab?.frame);
 await page.getByRole('button',{name:'本編ルートへ',exact:true}).click();
 await at('mond-town');
 await wait(()=>Number.isInteger(window.lab.frame.daily?.period));
 const period=(await frame()).daily.period;
 const start=await fixture('level',period);
 await load(start);
 await openBoard();
 await card(patrol,'offer').waitFor();
 assert.equal(await board.locator('[data-daily-mode="offer"]').count(),5);
 await shot('offers');
 await page.getByRole('button',{name:'拠点へ：璃月・港の広場',exact:true}).click();
 await at(liyue);
 await button(cargo,'offer').click();
 await page.getByRole('button',{name:'拠点へ：稲妻・城下の広場',exact:true}).click();
 await at(hub);
 await card(patrol,'offer').waitFor();
 assert.ok(await button(patrol,'offer').isDisabled());
 await button(fireworks,'offer').click();
 await button(nobushi,'offer').click();
 await wait(()=>window.lab.frame.daily.activeSlots.length===3);
 assert.ok(await button(trial,'offer').isDisabled());
 await gate(194,shore);
 await move(292);
 await held('KeyJ',id=>window.lab.frame.daily.activeSlots.find(q=>q.id===id).count>0,nobushi);
 const hunting=(await frame()).daily.activeSlots;
 assert.equal(hunting.find(q=>q.id===cargo).count,0);
 assert.ok(hunting.find(q=>q.id===fireworks).count>=hunting.find(q=>q.id===nobushi).count);
 await move(645);
 await wait(()=>window.lab.frame.storyElite?.name==='浜を仕切る野伏');
 assert.match(await page.locator('#storyElite').textContent(),/浜を仕切る野伏/);
 await shot('shore',page.locator('.game'));
 const popupPromise=page.waitForEvent('popup');
 await page.getByRole('link',{name:'この地点の配置比較を開く',exact:true}).click();
 const popup=await popupPromise;
 popup.on('pageerror',error=>errors.push(error.message));
 await popup.waitForFunction(()=>window.mapArt?.ready);
 assert.equal(await popup.locator('#node').inputValue(),shore);
 await popup.click('#loadLive');
 await popup.waitForFunction(()=>window.mapArt.count===8);
 for(const profile of ['legacy','h48c32','h32c16']){
  await popup.selectOption('#profile',profile);
  const comparison=await popup.evaluate(()=>window.mapArt);
  assert.ok(comparison.grounded&&comparison.backgroundState==='ready');
  assert.equal(comparison.placements.filter(enemy=>enemy.species==='nobushi').length,4);
 }
 await popup.close();
 await gate(62,hub);
 const lastCounts=(await frame()).daily.activeSlots.map(q=>q.count);
 await load(start);
 assert.deepEqual((await frame()).daily.activeSlots.map(q=>q.count),lastCounts);

 const ready=await fixture('ready',period);
 for(const slot of ready.daily.ledger.activeSlots)slot.count--;
 await load(ready);
 await gate(194,shore);
 await move(292);
 await held('KeyJ',()=>window.lab.frame.daily.activeSlots.every(q=>q.count===q.goal));
 await gate(62,hub);
 await openBoard();
 const before=await frame();
 for(const id of [patrol,fireworks,short]){
  await button(id,'active').click();
  await wait(id=>window.lab.frame.daily.activeSlots.find(q=>q.id===id)?.claimed,id);
 }
 const after=await frame();
 const reward={xp:after.progression.questXp-before.progression.questXp,mora:after.mora-before.mora};
 assert.deepEqual(reward,{xp:29920,mora:1970});
 await shot('claimed');
 await page.setViewportSize({width:390,height:844});
 assert.ok(await board.evaluate(node=>node.getBoundingClientRect().right<=390&&node.scrollWidth<=node.clientWidth));
 await load(ready);
 const older=await frame();
 assert.ok(older.daily.activeSlots.every(q=>q.claimed));
 assert.equal(older.progression.questXp,after.progression.questXp);
 assert.equal(older.mora,ready.mora+reward.mora);
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/daily-ina-web.json',JSON.stringify({
  townOffers:5,sharedLiyueLimits:true,walkedToShoreAndBack:true,nobushiKillAndAreaOverlap:true,
  namedEliteVisible:true,placementComparisonProfiles:3,oldSaveRetainsProgress:true,oldSaveCannotReclaim:true,
  mobileFits:true,reward,errors
 },null,2)+'\n');
 console.log('Inazuma: Chrome offers, shared slots, shore combat, named elite, claims and restore passed');
}catch(error){
 const current=await frame();
 console.error({node:current?.story?.node,position:current?.actors?.[0]?.x,elite:current?.storyElite,
  activeSlots:current?.daily?.activeSlots,portal:current?.storyNearbyPortal,
  save:await page.locator('#saveStatus').textContent(),errors});
 await page.screenshot({path:'work/daily-ina-failure.png'});
 throw error;
}finally{
 await browser.close();
}
