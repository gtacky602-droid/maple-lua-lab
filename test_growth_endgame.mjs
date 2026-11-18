import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1280,height:980}});
const wait=(predicate,arg)=>page.waitForFunction(predicate,arg,{timeout:42000});
const frame=()=>page.evaluate(()=>window.lab.frame);
const button=name=>page.getByRole('button',{name,exact:true});
const quest=id=>page.locator(`[data-quest="growth-${id}"]`);
const at=node=>wait(node=>window.lab.frame.story.node===node,node);
const canvas=page.locator('#game'),errors=[];
page.on('pageerror',error=>errors.push(error.message));

async function load(level){
 const fixture=await fs.readFile(`work/growth-endgame-lv${level}.json`,'utf8');
 await page.evaluate(data=>localStorage.setItem('maple-lua-lab.checkpoint.v1',data),fixture);
 const id=(await frame()).session;
 await page.locator('#loadProgress').click();
 await wait(id=>window.lab.frame.session!==id,id);
 await at('mond-town');
}

async function report(id){
 await quest(id).getByRole('button',{name:'報告',exact:true}).click();
 await wait(id=>window.lab.frame.story.quests['growth-'+id]?.status==='complete',id);
}

async function move(predicate,arg){
 await canvas.click();
 await page.keyboard.down('KeyD');
 try{await wait(predicate,arg)}finally{await page.keyboard.up('KeyD')}
}

async function gate(destination){
 await move(node=>window.lab.frame.storyNearbyPortal?.to===node&&window.lab.frame.storyNearbyPortal.available,destination);
 await page.keyboard.press('KeyF');
 await at(destination);
}

async function returnFromChallenge(){
 await button('挑戦入口に戻る').click();
 await wait(()=>!window.lab.frame.endgameRun);
 await at('mond-town');
}

try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8942/');
 await wait(()=>window.lab?.frame);
 await load(1);
 await page.locator('#abyssSet').selectOption('troupe');
 await button('深境螺旋・入門').click();
 await wait(()=>window.lab.frame.endgameRun?.room===1);
 assert.equal((await frame()).progression.level,1);
 assert.equal((await frame()).endgameRun.targets,12);
 await button('自動戦闘 OFF').click();
 for(const room of [1,2]){
  await wait(room=>window.lab.frame.endgameRun?.room===room&&window.lab.frame.endgameRun.status==='between',room);
  await button('次の区画へ').click();
 }
 await wait(()=>window.lab.frame.endgameRun?.room===3);
 await page.locator('.game').screenshot({path:'evidence/growth-abyss-entry.png'});
 await wait(()=>window.lab.frame.endgameRun?.status==='clear');
 const cleared=await frame();
 assert.equal(cleared.endgame.abyss.entry.clears,1);
 assert.equal(cleared.inventory.items[0].setId,'troupe');
 assert.match(await page.locator('#endgameRunStatus').textContent(),/突破.*黄金の劇団/);
 await returnFromChallenge();
 await report('abyss');

 await load(30);
 await quest('stygian').getByRole('button',{name:'受注',exact:true}).click();
 await button('幽境・ファルカ通常模擬戦').click();
 await wait(()=>window.lab.frame.endgameRun?.kind==='stygian');
 await button('自動戦闘 OFF').click();
 await wait(()=>window.lab.frame.story.growth?.['stygian-opening']);
 assert.ok((await frame()).boss.hp>0);
 await returnFromChallenge();
 await button('自動戦闘 ON').click();
 await report('stygian');

 await gate('mond-road');
 await gate('andrius-wolf-ring');
 await move(()=>window.lab.frame.actors[0].x>=383);
 await page.keyboard.press('Digit2');
 await wait(()=>window.lab.frame.story.growth?.['weekly-participation']);
 assert.ok((await frame()).weeklyBoss.hp>0);
 await button('拠点へ：モンド・城門広場').click();
 await at('mond-town');
 await report('weekly');

 await load(180);
 await page.setViewportSize({width:390,height:844});
 const reception=page.locator('#endgameDesk');
 assert.ok(await reception.evaluate(el=>el.getBoundingClientRect().right<=390&&el.scrollWidth<=el.clientWidth));
 await button('未発見の寄り道を探す').click();
 await wait(()=>window.lab.frame.endgame?.goal==='discover');
 await button('狙うセットの装備を更新').click();
 await wait(()=>window.lab.frame.endgame?.goal==='gear');
 await page.getByText('聖遺物バッグ・5部位装備',{exact:true}).click();
 await page.locator('[data-action="target_set:troupe"]').click();
 await button('操作中キャラに装備').click();
 await wait(()=>window.lab.frame.story.growth?.['postgame-progress']);
 await report('next-goal');
 await page.locator('#saveProgress').click();
 await wait(()=>document.getElementById('saveStatus').textContent.includes('冒険を保存しました'));
 await page.reload();
 await wait(()=>window.lab?.frame);
 await page.locator('#loadProgress').click();
 await at('mond-town');
 const restored=await frame();
 assert.equal(restored.story.quests['growth-next-goal'].status,'complete');
 assert.equal(restored.endgame.goal,'gear');
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/growth-endgame-web.json',JSON.stringify({
  reports:4, entryLv1AndThreeRooms:true, requestedRewardSet:'troupe', stygianBeforeVictory:true,
  weeklyParticipationBeforeVictory:'andrius', gearGoalChangedAndCompleted:true,
  mobileReceptionFits:true, completionSaved:true, errors
 },null,2)+'\n');
 console.log('Growth Q-G13–16: Lua combat in Chrome, four reports, mobile reception and save passed');
}catch(error){
 const f=await frame();
 console.error({node:f?.story?.node,run:f?.endgameRun,boss:f?.boss,weekly:f?.weeklyBoss,
  growth:f?.story?.growth,position:f?.actors[0].x,errors});
 await page.screenshot({path:'work/growth-endgame-failure.png'});
 throw error;
}finally{
 await browser.close();
}
