import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {chromium} from 'playwright';

const main='daily-mond-safety', slimes='daily-mond-slimes', rest='daily-mond-rest';
const elites='daily-mond-elites', cave='daily-mond-cave';
const hub='mond-town', road='mond-road';
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1280,height:960}});
const board=page.locator('#dailyBoard'), canvas=page.locator('#game'), errors=[];
page.on('pageerror',error=>errors.push(error.message));
const wait=(fn,arg,timeout=26000)=>page.waitForFunction(fn,arg,{timeout});
const frame=()=>page.evaluate(()=>window.lab.frame);
const card=(id,mode)=>page.locator(`[data-daily-id="${id}"][data-daily-mode="${mode}"]`);
const dailyRow=(id,mode)=>card(id,mode).getByRole('button');
const at=node=>wait(id=>window.lab?.frame.story?.node===id,node);
const shot=name=>board.screenshot({path:`evidence/daily-mond-${name}.png`});

async function openBoard(){
 if(!await board.evaluate(node=>node.open))await board.locator('summary').click();
}

async function key(code){
 await canvas.click();
 await page.keyboard.press(code);
}

async function held(code,predicate,arg){
 await canvas.click();
 await page.keyboard.down(code);
 try{await wait(predicate,arg)}finally{await page.keyboard.up(code)}
}

async function move(x){
 const f=await frame(),at=f.actors[f.active-1].x;
 if(Math.abs(at-x)<8)return;
 const right=at<x;
 await held(right?'KeyD':'KeyA',({x,right})=>{
  const f=window.lab.frame,p=f.actors[f.active-1].x;
  return right?p>=x-5:p<=x+5;
 },{x,right});
}

async function gate(x,node){
 await move(x);
 await wait(id=>window.lab.frame.storyNearbyPortal?.to===id&&window.lab.frame.storyNearbyPortal.available,node);
 await key('KeyF');
 await at(node);
}

async function load(snapshot){
 if(snapshot)await page.evaluate(s=>localStorage.setItem('maple-lua-lab.checkpoint.v1',s),JSON.stringify(snapshot));
 const {session}=await frame();
 await page.locator('#loadProgress').click();
 await wait(old=>window.lab.frame.session!==old,session);
 await at(hub);
}

async function save(){
 await page.locator('#saveProgress').click();
 await wait(()=>document.getElementById('saveStatus').textContent.includes('冒険を保存しました'));
}

async function hitSlime(){
 await move(439);
 await held('KeyJ',id=>window.lab.frame.daily?.activeSlots?.find(q=>q.id===id)?.count>=1,slimes);
}

try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8931/');
 await wait(()=>window.lab?.frame);
 await page.getByRole('button',{name:'本編ルートへ',exact:true}).click();
 await at(hub);
 await openBoard();
 await card(cave,'offer').waitFor();
 assert.ok(await dailyRow(cave,'offer').isDisabled());
 assert.match(await dailyRow(main,'offer').textContent(),/同行中のアンバー/);
 await card(main,'offer').locator('select').selectOption(road);
 await wait(id=>window.lab.frame.worldMap?.selected.id===id,road);
 assert.equal((await frame()).story.node,hub);
 await page.keyboard.press('Escape');
 await dailyRow(main,'offer').click();
 await dailyRow(slimes,'offer').click();
 await dailyRow(rest,'offer').click();
 await wait(()=>window.lab.frame.daily?.activeSlots?.length===3);
 assert.ok(await dailyRow(elites,'offer').isDisabled());
 await shot('accept');
 const first=await frame();
 assert.deepEqual(first.daily.usedSlots,{main:1,extra:2});
 await save();
 await gate(1380,road);
 await hitSlime();
 const hunting=await frame();
 const count=id=>hunting.daily.activeSlots.find(q=>q.id===id).count;
 assert.ok(count(slimes)>0&&count(main)>=count(slimes));
 assert.equal(count(main),count(rest));
 await shot('progress');
 await page.reload();
 await wait(()=>window.lab?.frame);
 await load();
 const restored=await frame();
 assert.deepEqual(restored.daily.activeSlots.map(q=>q.count),hunting.daily.activeSlots.map(q=>q.count));

 // The Lua test produces the full completion through real placements. Start one kill
 // from the end here so Chrome can prove the final attack, claim and stale restore.
 const ready=JSON.parse(await fs.readFile('work/daily-mond-ready-fixture.json','utf8'));
 ready.daily.profile=randomUUID().replaceAll('-','');
 ready.daily.ledger.period=restored.daily.period;
 for(const slot of ready.daily.ledger.activeSlots)slot.count--;
 await load(ready);
 await gate(1380,road);
 await move(439);
 await held('KeyJ',()=>window.lab.frame.daily.activeSlots.every(q=>q.count===q.goal));
 await openBoard();
 await card(main,'active').getByRole('button',{name:/帰り道を見る/}).click();
 await wait(id=>window.lab.frame.worldMap?.selected.id===id,hub);
 assert.equal((await frame()).story.node,road);
 assert.equal((await frame()).worldMap.guide.stops.at(-1).id,hub);
 await page.keyboard.press('Escape');
 await gate(60,hub);
 await openBoard();
 const before=await frame();
 for(const id of [main,slimes,rest]){
  await dailyRow(id,'active').click();
  await wait(id=>window.lab.frame.daily.activeSlots.find(q=>q.id===id)?.claimed,id);
 }
 const after=await frame();
 assert.equal(after.mora-before.mora,895);
 assert.equal(after.progression.questXp-before.progression.questXp,1120);
 await shot('claimed');
 await page.setViewportSize({width:390,height:844});
 const box=await board.boundingBox();
 assert.ok(box.x>=0&&box.x+box.width<=390);
 await shot('mobile');
 await load(ready);
 const older=await frame();
 assert.ok(older.daily.activeSlots.every(q=>q.claimed));
 assert.equal(older.progression.questXp,after.progression.questXp);
 assert.equal(older.mora,ready.mora+895);
 assert.deepEqual(errors,[]);
 const proof={offersVisible:true,noDuplicateAmberNpc:true,oneMainTwoExtras:true,actualKillAndOverlap:true,
  dailyLedgerSurvivesStaleSession:true,threeClaimsAndNoReclaim:true,mobileFits:true,
  reward:{xp:1120,mora:895},errors};
 await fs.writeFile('evidence/daily-mond-web.json',JSON.stringify(proof,null,2)+'\n');
 console.log('Mondstadt browser offers, real kills, reload, full claim and mobile passed');
}catch(err){
 console.error(await page.evaluate(()=>{
  const f=window.lab?.frame;
  return {node:f?.story?.node,daily:f?.daily,actors:f?.actors,portal:f?.storyNearbyPortal,notice:f?.storyNotice};
 }));
 console.error(errors);
 await page.screenshot({path:'work/daily-mond-failure.png'});
 throw err;
}finally{
 await browser.close();
}
