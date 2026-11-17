import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1440,height:1080}});
const base=process.env.LAB_URL||'http://127.0.0.1:8769';
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
page.setDefaultTimeout(15000);
const canvas=page.locator('canvas').first();
const frame=()=>page.evaluate(()=>window.lab.frame);
const location=id=>page.waitForFunction(id=>window.lab.frame.story.node===id,id);
const gate=name=>page.getByRole('button',{name:'門：'+name+' Lv20',exact:true});

async function walk(key,target){
 await canvas.scrollIntoViewIfNeeded();
 await canvas.click();
 await page.keyboard.down(key);
 try{
  await page.waitForFunction(({key,target})=>{
   const x=window.lab.frame.actors[0].x;
   return key==='KeyD'?x>=target:x<=target;
  },{key,target});
 }finally{await page.keyboard.up(key)}
}

try{
 await page.goto(base);
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#worldDetails summary').click();
 const catalog=JSON.parse(await fs.readFile('content/map-catalog.json','utf8'));
 const map=page.getByLabel('地図',{exact:true});
 const region=page.getByLabel('地域',{exact:true});
 const markers=page.locator('#worldPanel circle');
 const chosen=page.locator('#selectedMapNode');
 const filter=page.getByLabel('地点種別',{exact:true});
 const search=page.getByLabel('地点IDを検索',{exact:true});
 const layers=[];
 for(const {id,name,counts} of catalog.maps){
  await map.selectOption(String(id));
  const count=counts.waypoints+counts.statues;
  assert.equal(await markers.count(),count,name);
  layers.push({id,count});
 }
 await map.selectOption('10');
 assert.match(await chosen.innerText(),/地点はありません/);
 await map.selectOption('2');
 await filter.selectOption('statue');
 assert.equal(await markers.count(),64);
 await region.selectOption('16');
 assert.equal(await markers.count(),7);
 await region.selectOption('all');
 await filter.selectOption('all');
 await search.fill('teyvat:3');
 await page.locator('circle[aria-label="teyvat:3"]').press('Enter');
 assert.match(await chosen.innerText(),/モンド.*373\.5/);
 await search.fill('');
 await map.selectOption('9');
 const sourceMarker=catalog.nodes.find(marker=>marker.map_id===9);
 await page.locator(`circle[aria-label="${sourceMarker.id}"]`).press('Enter');
 assert.match(await chosen.innerText(),/層岩巨淵・地下鉱区/);
 assert.equal((await frame()).story.active,false);
 await page.locator('#worldPanel').screenshot({path:'evidence/world-catalog.png'});
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.setViewportSize({width:1440,height:1080});
 for(const [label,zone] of [['町（仮配置）','town'],['城外の狩場（仮配置）','field'],['無相の風・2D試作','boss_anemo']]){
  await page.locator('#worldPanel').getByRole('button',{name:label,exact:true}).click();
  if(zone==='boss_anemo')await page.waitForFunction(()=>window.lab.frame.boss?.name.includes('無相'));
  else await page.waitForFunction(zone=>window.lab.frame.campaign?.zone===zone,zone);
 }
 await page.locator('#worldDetails summary').click();

 await page.evaluate(raw=>localStorage.setItem('maple-lua-lab.checkpoint.v1',raw),
                     await fs.readFile('work/chasm-fixture.json','utf8'));
 await page.locator('#loadProgress').click();
 await location('liyue-harbor');
 await walk('KeyD',1310);
 await gate('璃月・岩間の狩場').click();
 await location('liyue-field');
 await gate('層岩巨淵・地下の調査拠点').click();
 await page.waitForFunction(()=>window.lab.frame.storyNotice?.includes('歩いて'));
 await walk('KeyD',1310);
 await gate('層岩巨淵・地下の調査拠点').click();
 await location('chasm-camp');
 const quest=page.locator('[data-quest="chasm-survey"]');
 await quest.getByRole('button',{name:'受注',exact:true}).click();
 await page.waitForSelector('[data-quest="chasm-survey"][data-status="active"]');
 await walk('KeyD',1150);
 await gate('層岩巨淵・地下の坑道').click();
 await location('chasm-depth');
 await page.waitForSelector('[data-quest="chasm-survey"][data-status="ready"]');
 assert.equal(await quest.getByRole('button',{name:'報告',exact:true}).isEnabled(),false);
 const popupEvent=page.waitForEvent('popup');
 await page.getByRole('link',{name:'この地点の配置比較を開く',exact:true}).click();
 const comparison=await popupEvent;
 comparison.on('pageerror',error=>errors.push(error.message));
 await comparison.waitForFunction(()=>window.mapArt?.ready);
 assert.equal(await comparison.locator('#node').inputValue(),'chasm-depth');
 assert.deepEqual(await comparison.evaluate(()=>[window.mapArt.backgroundState,window.mapArt.backgroundFallback]),['ready',false]);
 await comparison.selectOption('#profile','h32c16');
 await comparison.selectOption('#species','character-traveler');
 const preview=comparison.locator('#png');
 const {width,height}=await preview.boundingBox();
 for(const point of [[200,350],[440,260]]){
  await preview.click({position:{x:point[0]*width/960,y:point[1]*height/540}});
 }
 assert.equal(await comparison.evaluate(()=>window.mapArt.count),2);
 await comparison.locator('main').screenshot({path:'evidence/chasm-map-comparison.png'});
 await comparison.close();
 await walk('KeyA',118);
 await gate('層岩巨淵・地下の調査拠点').click();
 await location('chasm-camp');
 const before=await frame();
 await quest.getByRole('button',{name:'報告',exact:true}).click();
 await page.waitForSelector('[data-quest="chasm-survey"][data-status="complete"]');
 const reported=await frame();
 assert.equal(reported.mora-before.mora,300);
 assert.equal(reported.progression.questXp-before.progression.questXp,1100);
 assert.equal(reported.story.quests['chasm-survey'].cycles,1);
 await page.locator('#saveProgress').click();
 await page.waitForFunction(()=>document.getElementById('saveStatus').textContent.includes('保存しました'));
 await page.reload();
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#loadProgress').click();
 await location('chasm-camp');
 assert.equal((await frame()).story.quests['chasm-survey'].status,'complete');
 await walk('KeyA',118);
 await gate('璃月・岩間の狩場').click();
 await location('liyue-field');
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/world-browser.json',JSON.stringify({
  errors,layers,totalMarkers:catalog.nodes.length,statues:64,snezhnayaStatues:7,
  idCoordinatesVerified:true,trialNavigation:true,mobileWidth:true,
  chasm:{fixture:'Lv20 Liyue harbor',walkedRoute:true,remoteEntryRejected:true,rewardMora:300,rewardXp:1100,
         savedQuestComplete:true,spriteComparison:'PNG vs 16-color rectangles'}
 },null,2)+'\n');
 console.log('Official layers, region and marker filters, Chasm visit, save and comparison passed');
}finally{await browser.close()}
