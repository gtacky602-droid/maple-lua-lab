import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {chromium} from 'playwright';

const hub='sumeru-hub', field='sumeru-field', yard='sum-kaveh-timberyard';
const survey='daily-sum-survey', forest='daily-sum-forest', species='daily-sum-species';
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1280,height:980}});
const board=page.locator('#dailyBoard'), canvas=page.locator('#game'), errors=[];
const collect=page.locator('#nearbyCargoGo');
page.on('pageerror',error=>errors.push(error.message));
const wait=(fn,arg)=>page.waitForFunction(fn,arg,{timeout:26000});
const frame=()=>page.evaluate(()=>window.lab.frame);
const card=(id,mode)=>page.locator(`[data-daily-id="${id}"][data-daily-mode="${mode}"]`);
const button=(id,mode)=>card(id,mode).getByRole('button');
const at=node=>wait(id=>window.lab?.frame.story?.node===id,node);
const shot=(name,element=board)=>element.screenshot({path:`evidence/daily-sum-${name}.png`});
const record=f=>f.daily.activeSlots.find(q=>q.id===species);

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
 if(snapshot)await page.evaluate(s=>localStorage.setItem('maple-lua-lab.checkpoint.v1',s),JSON.stringify(snapshot));
 const {session}=await frame();
 const restore=page.waitForResponse(res=>res.url().endsWith('/api/frame')&&!!res.request().postDataJSON()?.restore);
 await page.locator('#loadProgress').click();
 const response=await restore;
 if(!response.ok())throw new Error(await response.text());
 await wait(old=>window.lab.frame.session!==old,session);
 await at(hub);
}

try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8934/');
 await wait(()=>window.lab?.frame);
 await page.getByRole('button',{name:'本編ルートへ',exact:true}).click();
 await at('mond-town');
 await wait(()=>Number.isInteger(window.lab.frame.daily?.period));
 const start=JSON.parse(await fs.readFile('work/daily-sum-level-fixture.json','utf8'));
 start.daily.profile=randomUUID().replaceAll('-','');
 start.daily.ledger.period=(await frame()).daily.period;
 await load(start);
 await openBoard();
 assert.equal(await board.locator('[data-daily-mode="offer"]').count(),5);
 assert.match(await card(species,'offer').textContent(),/キノコン.*水スライム.*炎スライム/);
 await shot('offers');
 for(const id of [survey,forest,species])await button(id,'offer').click();
 await wait(()=>window.lab.frame.daily.activeSlots.length===3);
 await page.locator('#saveProgress').click();
 await wait(()=>document.getElementById('saveStatus').textContent.includes('冒険を保存しました'));
 await gate(1380,field);
 await held('KeyD',()=>window.lab.frame.storyNearbyClue?.label==='キノコンを観察する');
 assert.match(await collect.textContent(),/G：キノコンを観察する/);
 await page.keyboard.press('KeyG');
 await wait(()=>window.lab.frame.daily.notice==='キノコンを記録しました。');
 assert.deepEqual(record(await frame()).species.filter(entry=>entry.recorded).map(entry=>entry.name),['キノコン']);
 await shot('recorded');
 await page.reload();
 await wait(()=>window.lab?.frame);
 await load(null);
 assert.deepEqual(record(await frame()).species.filter(entry=>entry.recorded).map(entry=>entry.name),['キノコン']);
 await gate(1380,field);
 await gate(230,yard);
 await move(296);
 await held('KeyJ',id=>window.lab.frame.daily.activeSlots.find(q=>q.id===id).count>0,forest);
 assert.equal(record(await frame()).count,1);
 await shot('workyard',page.locator('.game'));
 await gate(63,field);
 await move(446);
 await held('KeyJ',id=>window.lab.frame.daily.activeSlots.find(q=>q.id===id).count>=2,species);
 await move(792);
 await held('KeyJ',id=>window.lab.frame.daily.activeSlots.find(q=>q.id===id).count===3,species);
 assert.deepEqual(record(await frame()).species.map(entry=>entry.recorded),[true,true,true]);
 await gate(60,hub);
 await openBoard();
 const before=await frame();
 await button(species,'active').click();
 await wait(id=>window.lab.frame.daily.activeSlots.find(q=>q.id===id).claimed,species);
 const after=await frame();
 const reward={xp:after.progression.questXp-before.progression.questXp,mora:after.mora-before.mora};
 assert.deepEqual(reward,{xp:9590,mora:410});
 await page.setViewportSize({width:390,height:844});
 assert.ok(await board.evaluate(node=>node.getBoundingClientRect().right<=390&&node.scrollWidth<=node.clientWidth));
 await shot('claimed');
 await load(null);
 assert.ok(record(await frame()).claimed);
 assert.equal((await frame()).progression.questXp,after.progression.questXp);
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/daily-sum-web.json',JSON.stringify({
  townOffers:5,normalGRecordsLiveFungus:true,normalCombatCompletesOtherSpecies:true,
  sameSpeciesOutsideTargetFieldDoesNotCount:true,workyardWalkAndHunt:true,
  speciesRecordSurvivesOldSave:true,claimCannotReplay:true,mobileFits:true,reward,errors
 },null,2)+'\n');
 console.log('Sumeru: Chrome observation, ordinary kills, workyard, stale save and reward passed');
}catch(error){
 const current=await frame();
 console.error({node:current?.story?.node,position:current?.actors?.[0]?.x,kills:current?.kills,
  clue:current?.storyNearbyClue,slots:current?.daily?.activeSlots,portal:current?.storyNearbyPortal,
  save:await page.locator('#saveStatus').textContent(),errors});
 await page.screenshot({path:'work/daily-sum-failure.png'});
 throw error;
}finally{
 await browser.close();
}
