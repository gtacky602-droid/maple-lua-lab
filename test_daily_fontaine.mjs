import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {chromium} from 'playwright';

const hub='fontaine-hub', canal='fontaine-field', yard='fontaine-outskirts-loading';
const patrol='daily-fon-patrol', gathering='daily-fon-gathering', meka='daily-fon-meka', elites='daily-fon-land-elites';
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1280,height:980}});
const board=page.locator('#dailyBoard'), canvas=page.locator('#game'), errors=[];
page.on('pageerror',error=>errors.push(error.message));
const wait=(fn,arg)=>page.waitForFunction(fn,arg,{timeout:26000});
const frame=()=>page.evaluate(()=>window.lab.frame);
const card=(id,mode)=>page.locator(`[data-daily-id="${id}"][data-daily-mode="${mode}"]`);
const button=(id,mode)=>card(id,mode).getByRole('button');
const at=node=>wait(id=>window.lab?.frame.story?.node===id,node);
const shot=(name,element=board)=>element.screenshot({path:`evidence/daily-fon-${name}.png`});

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
 const snapshot=JSON.parse(await fs.readFile(`work/daily-fon-${name}-fixture.json`,'utf8'));
 snapshot.daily.profile=randomUUID().replaceAll('-','');
 snapshot.daily.ledger.period=period;
 return snapshot;
}

async function enterLoadingYard(){
 await gate(1380,canal);
 await gate(194,yard);
}

async function returnToHub(){
 await gate(62,canal);
 await gate(60,hub);
}

try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8935/');
 await wait(()=>window.lab?.frame);
 await page.getByRole('button',{name:'本編ルートへ',exact:true}).click();
 await at('mond-town');
 await wait(()=>Number.isInteger(window.lab.frame.daily?.period));
 const period=(await frame()).daily.period;
 const start=await fixture('level',period);
 await load(start);
 await openBoard();
 await card(meka,'offer').waitFor();
 assert.equal(await board.locator('[data-daily-mode="offer"]').count(),5);
 await shot('offers');
 for(const id of [patrol,gathering,meka])await button(id,'offer').click();
 await wait(()=>window.lab.frame.daily.activeSlots.length===3);
 assert.ok(await button(elites,'offer').isDisabled());
 await enterLoadingYard();
 await move(295);
 await held('KeyJ',id=>window.lab.frame.daily.activeSlots.find(q=>q.id===id).count>0,meka);
 const counted=Object.fromEntries((await frame()).daily.activeSlots.map(q=>[q.id,q.count]));
 assert.ok(counted[patrol]>=counted[meka]&&counted[gathering]>=counted[meka]);
 await move(696);
 await wait(()=>window.lab.frame.storyElite?.name==='搬入口の精鋭メカ');
 await shot('loading',page.locator('.game'));
 const popupPromise=page.waitForEvent('popup');
 await page.getByRole('link',{name:'この地点の配置比較を開く',exact:true}).click();
 const popup=await popupPromise;
 popup.on('pageerror',error=>errors.push(error.message));
 await popup.waitForFunction(()=>window.mapArt?.ready);
 assert.equal(await popup.locator('#node').inputValue(),yard);
 await popup.click('#loadLive');
 await popup.waitForFunction(()=>window.mapArt.count===8);
 for(const profile of ['legacy','h48c32','h32c16']){
  await popup.selectOption('#profile',profile);
  const comparison=await popup.evaluate(()=>window.mapArt);
  assert.ok(comparison.grounded&&comparison.backgroundState==='ready');
  assert.equal(comparison.placements.filter(enemy=>enemy.species==='sled-maintenance-cart').length,5);
 }
 await popup.close();
 await returnToHub();
 const lastCounts=(await frame()).daily.activeSlots.map(q=>q.count);
 await load(start);
 assert.deepEqual((await frame()).daily.activeSlots.map(q=>q.count),lastCounts);

 const ready=await fixture('ready',period);
 ready.daily.ledger.activeSlots.find(q=>q.id===meka).count--;
 await load(ready);
 await enterLoadingYard();
 await move(295);
 await held('KeyJ',()=>window.lab.frame.daily.activeSlots.every(q=>q.count===q.goal));
 await returnToHub();
 await openBoard();
 const before=await frame();
 for(const id of [meka,elites]){
  await button(id,'active').click();
  await wait(id=>window.lab.frame.daily.activeSlots.find(q=>q.id===id)?.claimed,id);
 }
 const after=await frame();
 const reward={xp:after.progression.questXp-before.progression.questXp,mora:after.mora-before.mora};
 assert.deepEqual(reward,{xp:69040,mora:2550});
 await shot('claimed');
 await page.setViewportSize({width:390,height:844});
 assert.ok(await board.evaluate(node=>node.getBoundingClientRect().right<=390&&node.scrollWidth<=node.clientWidth));
 await load(ready);
 const older=await frame();
 assert.ok(older.daily.activeSlots.every(q=>q.claimed));
 assert.equal(older.progression.questXp,after.progression.questXp);
 assert.equal(older.mora,ready.mora+reward.mora);
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/daily-fon-web.json',JSON.stringify({
  townOffers:5,walkedCanalToLoadingYardAndBack:true,normalAttackCountsThreeObjectives:true,
  namedMekaEliteVisible:true,placementComparisonProfiles:3,staleSaveRetainsProgress:true,
  rewardsDoNotReplay:true,mobileFits:true,reward,errors
 },null,2)+'\n');
 console.log('Fontaine: Chrome walking, meka kills, three overlapping objectives, placement comparison and claims passed');
}catch(error){
 const current=await frame();
 console.error({node:current?.story?.node,position:current?.actors?.[0]?.x,elite:current?.storyElite,
  slots:current?.daily?.activeSlots,portal:current?.storyNearbyPortal,
  save:await page.locator('#saveStatus').textContent,errors});
 await page.screenshot({path:'work/daily-fon-failure.png'});
 throw error;
}finally{
 await browser.close();
}
