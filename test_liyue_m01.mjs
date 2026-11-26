import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1200,height:900}});
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
page.setDefaultTimeout(15000);
const id='liyue-market-delivery';
const row=page.locator('[data-quest="liyue-market-delivery"]');
const beidou=page.locator('[data-quest="beidou-join"]');
const canvas=page.locator('#game');
const frame=()=>page.evaluate(()=>window.lab.frame);
const shop=page.locator('#storyDelivery');
const draft=process.env.DRAFT_BALANCE==='1';
const suffix=draft?'-draft':'';

async function focus(){
 await canvas.scrollIntoViewIfNeeded();
 await canvas.click();
}
async function walk(x,attack=false){
 const f=await frame(),east=f.actors[f.active-1].x<x,key=east?'KeyD':'KeyA';
 await focus();
 if(attack)await page.keyboard.down('KeyJ');
 await page.keyboard.down(key);
 try{
  await page.waitForFunction(({x,east})=>{
   const f=window.lab.frame,a=f.actors[f.active-1];
   return east?a.x>=x-7:a.x<=x+7;
  },{x,east});
 }finally{
  await page.keyboard.up(key);
  if(attack)await page.keyboard.up('KeyJ');
 }
}
async function through(target){
 await page.waitForFunction(target=>{
  const portal=window.lab.frame.storyNearbyPortal;
  return portal?.to===target&&portal.available;
 },target);
 await page.keyboard.press('KeyF');
 await page.waitForFunction(target=>window.lab.frame.story.node===target,target);
}
async function deliver(label,n){
 await shop.getByRole('button',{name:'荷札「'+label+'」を渡す',exact:true}).click();
 await page.waitForFunction(({id,n})=>window.lab.frame.story.quests[id].count===n,{id,n});
}

const preview=await browser.newPage();
async function checkStop(key,value,stocked){
 await page.waitForFunction(({key,value})=>{
  const link=document.getElementById('trackedSurveyPoint');
  return !link.hidden&&new URL(link.href).searchParams.get(key)===value;
 },{key,value});
 const url=new URL(await page.locator('#trackedSurveyPoint').getAttribute('href'),page.url());
 assert.deepEqual(url.searchParams.getAll('stocked'),stocked);
 await preview.goto(url.href);
 await preview.waitForFunction(()=>window.mapArt?.ready);
 if(key==='subject')assert.equal(await preview.locator('#liveSubject').inputValue(),value);
 else assert.equal(await preview.locator('#surveyPointNote').getAttribute('data-worksite'),value);
}
async function pixel(x,y,rgb){
 for(const id of ['png','rect']){
  assert.deepEqual(await preview.evaluate(({id,x,y})=>Array.from(document.getElementById(id)
   .getContext('2d').getImageData(x-mapArt.camera,y,1,1).data).slice(0,3),{id,x,y}),rgb);
 }
}
try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8769');
 await page.waitForFunction(()=>window.lab?.frame);
 assert.equal(Boolean((await frame()).fieldBalance),draft);
 await page.evaluate(raw=>localStorage.setItem('maple-lua-lab.checkpoint.v1',raw),
                     await fs.readFile('work/liyue-m01-fixture.json','utf8'));
 await page.locator('#loadProgress').click();
 await page.waitForFunction(()=>window.lab.frame.story.node==='liyue-harbor');
 await page.waitForSelector('[data-quest="beidou-join"][data-status="locked"]');
 await row.getByRole('button',{name:'受注',exact:true}).click();
 await page.waitForSelector('[data-quest="beidou-join"][data-status="unaccepted"]');
 await row.getByRole('button',{name:'この依頼を追跡',exact:true}).click();

 await page.selectOption('#trackedWorksite','vessel');
 await checkStop('worksite','vessel',[]);
 await page.selectOption('#trackedWorksite','pot');
 await checkStop('worksite','pot',[]);
 await pixel(248,450,[213,151,96]);
 await walk(245);
 await shop.getByRole('button',{name:'荷札「器」を渡す',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('#storyDeliveryResult').textContent.includes('もう一度'));
 assert.equal((await frame()).story.quests[id].count,0);
 await deliver('鍋',1);
 await checkStop('worksite','vessel',['pot']);
 await pixel(237,439,[213,151,96]);
 assert.deepEqual((await frame()).storyShopStock,{pot:true,vessel:false,wheel:false});
 await walk(615);
 await deliver('器',2);
 await page.locator('#saveProgress').click();
 await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('保存しました'));
 await page.reload();
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#loadProgress').click();
 await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('保存した進行で町から再開しました'));
 assert.deepEqual((await frame()).storyShopStock,{pot:true,vessel:true,wheel:false});

 await checkStop('subject','liyue-loading-yard-1',[]);
 await walk(400);
 await through('liyue-loading-yard');
 await walk(432,true);
 await focus();
 await page.keyboard.down('KeyJ');
 try{
  await page.waitForFunction(id=>window.lab.frame.story.quests[id].delivery.guardCleared,id);
 }finally{await page.keyboard.up('KeyJ')}
 await checkStop('worksite','wheel',[]);
 await pixel(735,362,[241,213,142]);
 await walk(735);
 await focus();
 await page.keyboard.down('Space');
 try{
  await page.waitForFunction(()=>window.lab.frame.storyNearbyParcel?.name==='車輪の荷箱');
 }finally{await page.keyboard.up('Space')}
 await page.keyboard.press('KeyG');
 await page.waitForFunction(id=>window.lab.frame.story.quests[id].delivery.recovered,id);
 await walk(106);
 await through('liyue-harbor');
 await checkStop('worksite','wheel',['pot','vessel']);
 await pixel(608,439,[119,157,199]);
 await walk(1050);
 await shop.getByRole('button',{name:'荷札「車輪」を渡す'}).waitFor();
 await page.locator('.game').screenshot({path:`evidence/liyue-m01-delivery${suffix}.png`});
 await deliver('車輪',3);
 await page.waitForSelector('[data-quest="liyue-market-delivery"][data-status="ready"]');
 assert.deepEqual((await frame()).storyShopStock,{pot:true,vessel:true,wheel:true});
 assert.equal(await page.locator('#storyDeliveryResult').isVisible(),false);

 const before=await frame();
 assert.match(await row.innerText(),/初回報酬：港の護送剣/);
 await row.getByRole('button',{name:'報告',exact:true}).click();
 await page.waitForSelector('[data-quest="liyue-market-delivery"][data-status="complete"]');
 await checkStop('worksite','pot',['pot','vessel','wheel']);
 const paid=await frame();
 assert.match(await row.innerText(),/石切り場/);
 assert.equal(paid.mora-before.mora,300);
 assert.equal(paid.progression.questXp-before.progression.questXp,10929);
 await page.locator('#weaponPanel summary').click();
 const weapon=page.locator('[data-weapon="SW02"]');
 await weapon.getByRole('button',{name:'旅人に装備',exact:true}).click();
 await page.waitForFunction(()=>window.lab.frame.weaponView.traveler==='SW02');
 await weapon.getByRole('button',{name:'強化 80モラ',exact:true}).click();
 await page.waitForFunction(()=>window.lab.frame.weaponView.options.some(item=>item.id==='SW02'&&item.level===1));
 const upgraded=await frame();
 assert.equal(upgraded.mora,paid.mora-80);
 assert.equal(upgraded.actors[0].atk,draft?18:6);
 await page.locator('#saveProgress').click();
 await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('保存しました'));
 await page.reload();
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#loadProgress').click();
 await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('保存した進行で町から再開しました'));
 assert.equal((await frame()).story.quests[id].status,'complete');
 assert.deepEqual((await frame()).storyShopStock,{pot:true,vessel:true,wheel:true});
 const resumed=await frame();
 assert.equal(resumed.weaponView.traveler,'SW02');
 assert.equal(resumed.weaponView.options.find(item=>item.id==='SW02').level,1);
 assert.equal(resumed.actors[0].atk,upgraded.actors[0].atk);
 await page.setViewportSize({width:390,height:844});
 await page.locator('#weaponPanel summary').click();
 await page.locator('#weaponPanel').screenshot({path:`evidence/weapon-progression-mobile${suffix}.png`});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 let draftHunt;
 if(draft){
  await page.setViewportSize({width:1200,height:900});
  await walk(1380);
  await through('liyue-field');
  const battlefield=await frame();
  const {count,minHp,maxHp}=battlefield.fieldBalance;
  assert.ok(count>0&&minHp>=32&&maxHp>minHp);
  assert.match(await page.locator('#fieldBalance').innerText(),/比較版.*最大HP/);
  assert.equal(await page.locator('#expRanking').isVisible(),false);
  await walk(500,true);
  await focus();
  await page.keyboard.down('KeyJ');
  try{
   await page.waitForFunction(kills=>window.lab.frame.kills>kills,battlefield.kills);
  }finally{await page.keyboard.up('KeyJ')}
  const hunted=await frame();
  await page.locator('main > header').scrollIntoViewIfNeeded();
  await page.screenshot({path:'evidence/field-balance-draft-browser.png'});
  draftHunt={count,minHp,maxHp,kills:hunted.kills-battlefield.kills,
   killXp:hunted.progression.killXp-battlefield.progression.killXp};
 }
 assert.deepEqual(errors,[]);
 await fs.writeFile(`evidence/liyue-m01-browser${suffix}.json`,JSON.stringify({
  errors,wrongLabelRejected:true,delivered:['鍋','器','車輪'],guardedJumpCache:true,
  stockedThreeStalls:true,partialSave:true,beidouQuestOpensOnAcceptance:true,
  report:{xp:10929,mora:300},completeSave:true,mobileWidth:true,
  weapon:{id:'SW02',upgrade:1,cost:80,travelerAtkBefore:paid.actors[0].atk,
   travelerAtkAfter:resumed.actors[0].atk,restored:true},draftHunt
 },null,2)+'\n');
 console.log('Liyue M01 browser matching labels, guarded crate, report and reload passed');
}finally{await browser.close()}
