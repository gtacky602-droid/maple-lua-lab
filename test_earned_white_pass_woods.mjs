import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const output=process.argv[2]??'work/earned-white-pass-woods';
const station='white-pass-station',woods='white-pass-woods',id='white-pass-trail',sword='SW07';
const data=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const seed=JSON.parse(await fs.readFile(`${output}/woods-ready.json`,'utf8'));
const lua=JSON.parse(await fs.readFile(`${output}/lua.json`,'utf8'));
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1280,height:960}});
const drive=waypointDriver(page,Object.fromEntries(data.nodes.map(n=>[n.id,n])),{walkTimeout:20000});
const game=page.locator('#game'),errors=[];
page.on('pageerror',error=>errors.push(error.message));
const frame=()=>page.evaluate(()=>window.lab.frame);
const shot=name=>game.screenshot({path:`${output}/${name}.png`});

async function checkpoint(){
 await page.locator('#saveProgress').click();
 await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('冒険を保存しました'));
 const saved=await page.evaluate(()=>localStorage.getItem('maple-lua-lab.checkpoint.v1'));
 await page.reload();
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#loadProgress').click();
 await drive.waitNode(station);
 return JSON.parse(saved);
}

async function inspect(x,label){
 await drive.walk(x);
 await page.waitForFunction(label=>window.lab.frame.storyNearbyMilestone?.label===label,label);
 await page.keyboard.press('KeyG');
}

async function compareGuidepost(){
 const mode=page.locator('#renderMode');
 await page.locator('#pause').click();
 await page.waitForFunction(()=>window.lab.frame.paused);
 const png=await frame();
 const sign=f=>f.draws.filter(d=>d.color==='#a57b53');
 assert.equal(sign(png).length,1);
 await shot('revisited-sign-png');
 await mode.selectOption('rect');
 await page.waitForFunction(n=>window.lab.frame.commands>n*8,png.commands);
 const standard=await frame();
 await mode.selectOption('h32c16');
 await page.waitForFunction(n=>window.lab.frame.commands<n*.66,standard.commands);
 const light=await frame();
 for(const f of [standard,light]){
  assert.equal(f.t,png.t);
  assert.deepEqual(sign(f),sign(png));
 }
 await shot('revisited-sign-light');
 return {png:png.commands,standard:standard.commands,light:light.commands};
}

try{
 await page.goto(process.env.LAB_URL??'http://127.0.0.1:8856/');
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#importSave').setInputFiles(`${output}/woods-ready.json`);
 await drive.waitNode(station);
 assert.equal((await frame()).progression.level,148);
 assert.equal((await frame()).weaponView.options.find(item=>item.id===sword)?.owned,false);
 await drive.accept(id);
 await game.click();
 await page.keyboard.press('KeyM');
 const atlas=page.locator('#worldAtlas');
 await atlas.waitFor();
 await page.locator('#atlasField').selectOption(woods);
 await page.waitForFunction(woods=>window.lab.frame.worldMap?.selected?.id===woods,woods);
 const plan=(await frame()).worldMap.guide;
 assert.equal(plan.status,'ready');
 assert.deepEqual(plan.stops.map(s=>s.id),[woods]);
 await page.keyboard.press('Escape');
 await atlas.waitFor({state:'hidden'});

 await drive.cross(woods);
 await inspect(300,'林の目印を確認する');
 await drive.count(id,1);
 const partial=await checkpoint();
 assert.equal(partial.story.quests[id].count,1);
 await drive.count(id,1);
 await drive.cross(woods);
 await drive.walk(1115);
 assert.equal((await drive.actor()).y,480);
 assert.notEqual((await frame()).storyNearbyMilestone?.label,'岩棚の印を写す');
 await drive.changeHeight(382);
 await inspect(1115,'岩棚の印を写す');
 await drive.count(id,2);
 await inspect(1660,'案内を読む');
 await drive.count(id,3);
 await drive.cross(station);
 const before=await frame();
 await drive.report(id);
 const after=await frame();
 const reward=[after.progression.questXp-before.progression.questXp,after.mora-before.mora];
 assert.deepEqual(reward,lua.reward);
 const attack=f=>f.actors.find(a=>a.id===1).atk;
 await page.locator('#weaponPanel summary').click();
 await page.locator(`[data-weapon="${sword}"]`).getByRole('button',{name:'旅人に装備',exact:true}).click();
 await page.waitForFunction(sword=>window.lab.frame.weaponView.traveler===sword,sword);
 const equipped=await frame();
 assert.deepEqual([attack(before),attack(equipped)],lua.travelerAttack);
 const finished=await checkpoint();
 assert.equal((await frame()).weaponView.traveler,sword);
 assert.equal(attack(await frame()),attack(equipped));
 const prior=Object.entries(seed.story.quests).filter(([,q])=>q.status==='complete');
 for(const [id,q] of prior)assert.deepEqual(finished.story.quests[id],q,id);
 const remaining=new Set(finished.inventory.items.map(item=>item.id));
 for(const item of seed.inventory.items)assert.ok(remaining.has(item.id),item.id);
 assert.equal(finished.companion,seed.companion);
 await drive.cross(woods);
 await inspect(1660,'峠小屋の案内を読み返す');
 await page.waitForFunction(()=>window.lab.frame.storyNotice?.includes('Lv155'));
 const commands=await compareGuidepost();
 assert.deepEqual(errors,[]);
 await fs.writeFile(`${output}/complete.json`,JSON.stringify(finished)+'\n');
 const proof={level:finished.progression.level,firstMarkerRestored:true,requiredUpperShelf:true,
  guideStops:plan.stops.map(s=>s.id),signReadAfterReport:true,signMatches:true,commands,reward,
  weapon:sword,travelerAttack:[attack(before),attack(equipped)],priorQuests:prior.length,
  inventoryKept:remaining.size,companion:finished.companion,errors};
 await fs.writeFile(`${output}/browser.json`,JSON.stringify(proof,null,2)+'\n');
 console.log(proof);
}catch(error){
 console.error(await page.evaluate(()=>({node:window.lab?.frame?.story?.node,actor:window.lab?.frame?.actors[0],
  quest:window.lab?.frame?.story?.quests['white-pass-trail'],gate:window.lab?.frame?.storyNearbyPortal,
  milestone:window.lab?.frame?.storyNearbyMilestone})),errors);
 throw error;
}finally{await browser.close()}
