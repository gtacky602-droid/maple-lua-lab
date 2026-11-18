import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {chromium} from 'playwright';

const mond='mond-town', hub='liyue-harbor', field='liyue-field';
const mondMain='daily-mond-safety', mondExtra='daily-mond-slimes';
const main='daily-liyue-cargo', route='daily-liyue-route', material='daily-liyue-prep-materials';
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1280,height:960}});
const board=page.locator('#dailyBoard'), canvas=page.locator('#game'), errors=[];
page.on('pageerror',error=>errors.push(error.message));
const wait=(fn,arg)=>page.waitForFunction(fn,arg,{timeout:26000});
const frame=()=>page.evaluate(()=>window.lab.frame);
const card=(id,mode)=>page.locator(`[data-daily-id="${id}"][data-daily-mode="${mode}"]`);
const button=(id,mode)=>card(id,mode).getByRole('button');
const at=node=>wait(id=>window.lab?.frame.story?.node===id,node);
const shot=name=>board.screenshot({path:`evidence/daily-liyue-${name}.png`});

async function openBoard(){
 if(!await board.evaluate(node=>node.open))await board.locator('summary').click();
}

async function held(code,predicate,arg){
 await canvas.click();
 await page.keyboard.down(code);
 try{await wait(predicate,arg)}finally{await page.keyboard.up(code)}
}

async function move(x){
 const f=await frame(), position=f.actors[f.active-1].x;
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

async function load(snapshot,node){
 if(snapshot)await page.evaluate(s=>localStorage.setItem('maple-lua-lab.checkpoint.v1',s),JSON.stringify(snapshot));
 const {session}=await frame();
 const restore=page.waitForResponse(res=>res.url().endsWith('/api/frame')&&!!res.request().postDataJSON()?.restore);
 await page.locator('#loadProgress').click();
 const response=await restore;
 if(!response.ok())throw new Error(await response.text());
 await wait(old=>window.lab.frame.session!==old,session);
 await at(node);
}

async function fixture(name,period){
 const snapshot=JSON.parse(await fs.readFile(`work/daily-liyue-${name}-fixture.json`,'utf8'));
 snapshot.daily.profile=randomUUID().replaceAll('-','');
 snapshot.daily.ledger.period=period;
 return snapshot;
}

try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8932/');
 await wait(()=>window.lab?.frame);
 await page.getByRole('button',{name:'本編ルートへ',exact:true}).click();
 await at(mond);
 await wait(()=>Number.isInteger(window.lab.frame.daily?.period));
 const period=(await frame()).daily.period;
 const start=await fixture('level',period);
 await load(start,mond);
 await openBoard();
 await button(mondMain,'offer').click();
 await button(mondExtra,'offer').click();
 await page.getByRole('button',{name:'拠点へ：璃月・港の広場',exact:true}).click();
 await at(hub);
 await card(main,'offer').waitFor();
 assert.ok(await button(main,'offer').isDisabled());
 await button(material,'offer').click();
 await wait(()=>window.lab.frame.daily.activeSlots.length===3);
 assert.ok(await button(route,'offer').isDisabled());
 assert.deepEqual((await frame()).daily.usedSlots,{main:1,extra:2});
 await shot('shared');
 await page.locator('#saveProgress').click();
 await wait(()=>document.getElementById('saveStatus').textContent.includes('冒険を保存しました'));
 await gate(1380,field);
 await move(439);
 await held('KeyJ',id=>window.lab.frame.daily.activeSlots.find(q=>q.id===id).count>=1,material);
 assert.match(await card(material,'active').textContent(),/仕込み用の素材/);
 await shot('material');
 await gate(60,hub);
 const hunting=(await frame()).daily.activeSlots;
 assert.deepEqual(hunting.filter(q=>q.id!==material).map(q=>q.count),[0,0]);
 assert.ok(hunting.find(q=>q.id===material).count>0);
 await page.reload();
 await wait(()=>window.lab?.frame);
 await load(null,hub);
 assert.deepEqual((await frame()).daily.activeSlots.map(q=>q.count),hunting.map(q=>q.count));

 const ready=await fixture('ready',period);
 for(const slot of ready.daily.ledger.activeSlots)slot.count--;
 await load(ready,hub);
 await gate(1380,field);
 await move(439);
 await held('KeyJ',()=>window.lab.frame.daily.activeSlots.every(q=>q.count===q.goal));
 await gate(60,hub);
 await openBoard();
 const before=await frame();
 for(const id of [main,route,material]){
  await button(id,'active').click();
  await wait(id=>window.lab.frame.daily.activeSlots.find(q=>q.id===id)?.claimed,id);
 }
 const after=await frame();
 const reward={xp:after.progression.questXp-before.progression.questXp,mora:after.mora-before.mora};
 assert.deepEqual(reward,{xp:6980,mora:1365});
 await shot('claimed');
 await page.setViewportSize({width:390,height:844});
 assert.ok(await board.evaluate(node=>node.getBoundingClientRect().right<=390&&node.scrollWidth<=node.clientWidth));
 await shot('mobile');
 await load(ready,hub);
 const older=await frame();
 assert.ok(older.daily.activeSlots.every(q=>q.claimed));
 assert.equal(older.progression.questXp,after.progression.questXp);
 assert.equal(older.mora,ready.mora+reward.mora);
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/daily-liyue-web.json',JSON.stringify({
  hubsShareSlots:true,ordinaryPortalAndAttack:true,materialProgress:true,threeGoalsOverlap:true,
  restoredProgress:true,oldSaveCannotReclaim:true,mobileFits:true,reward,errors
 },null,2)+'\n');
 console.log('Liyue browser travel, shared slots, material progress, claims and mobile passed');
}catch(error){
 const current=await frame();
 console.error({node:current?.story?.node,position:current?.actors?.[0]?.x,
  activeSlots:current?.daily?.activeSlots,portal:current?.storyNearbyPortal,
  save:await page.locator('#saveStatus').textContent(),errors});
 await page.screenshot({path:'work/daily-liyue-failure.png'});
 throw error;
}finally{
 await browser.close();
}
