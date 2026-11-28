import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';
import {driveAndrius} from './tools/browser_andrius_test.mjs';

const output='work/earned-andrius-rematch';
const file=process.argv[2]??'work/earned-aurora-cap/lv200-challenges-save.json';
const raw=await fs.readFile(file);
const seed=JSON.parse(raw);
const id='boss-29020101',normal=id,expert=id+':expert';
const town='mond-town',road='mond-road',arena='andrius-wolf-ring';
const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const nodes=Object.fromEntries(graph.nodes.map(node=>[node.id,node]));
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:390,height:844}});
const drive=waypointDriver(page,nodes,{walkTimeout:22000});
const desk=page.locator('#weeklyDesk'),choice=page.locator('#weeklyDifficulty');
const start=page.locator('#weeklyChallengeStart'),errors=[];
const frame=()=>page.evaluate(()=>window.lab.frame);
page.on('pageerror',error=>errors.push(error.message));

async function roadEntrance(){
 await drive.cross(road);
 await drive.walk(940);
 await desk.waitFor();
 await page.waitForFunction(id=>window.lab.frame.weeklyDesk?.id===id,id);
}

try{
 await fs.mkdir(output,{recursive:true});
 await page.goto(process.env.LAB_URL??'http://127.0.0.1:8941/');
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#importSave').setInputFiles(file);
 await drive.waitNode('white-pass-station');
 await page.getByRole('button',{name:'拠点へ：モンド・城門広場',exact:true}).click();
 await drive.waitNode(town);
 await page.locator('#game').click();
 await page.keyboard.press('KeyM');
 const atlas=page.locator('#worldAtlas');
 await atlas.waitFor();
 await page.locator('#atlasLayer').selectOption('boss');
 await page.locator('#atlasField').selectOption(arena);
 await page.waitForFunction(id=>window.lab.frame.worldMap?.selected?.id===id,arena);
 const guide=(await frame()).worldMap.guide;
 assert.equal(guide.status,'ready');
 assert.deepEqual(guide.stops.map(stop=>stop.id),[road,arena]);
 await page.keyboard.press('Escape');
 await atlas.waitFor({state:'hidden'});
 await roadEntrance();
 const entrance=await frame();
 assert.equal(entrance.weeklyDesk.storyRecord.clears,seed.endgame.bosses[normal].clears);
 assert.ok(entrance.weeklyDesk.remaining>0);
 assert.equal(await page.locator('#nearbyPortalGo').textContent(),'F：本編戦へ');
 assert.match(await page.locator('#weeklyEntranceInfo').textContent(),/本編戦 1勝.*風・氷 無効/);
 assert.ok(await desk.evaluate(el=>el.getBoundingClientRect().right<=390&&el.scrollWidth<=el.clientWidth));
 await choice.selectOption('expert');
 const picked=(await frame()).weeklyDesk.modes.find(mode=>mode.id==='expert');
 assert.equal(picked.level,180);
 assert.equal(picked.record,undefined);
 assert.ok(await start.isDisabled());
 assert.match(await page.locator('#weeklyChallengeDetails').textContent(),/初回追加.*再出現まで/);
 await desk.screenshot({path:output+'/first-expert-wait.png'});
 await page.waitForFunction(()=>{
  const arena=window.lab.frame.weeklyDesk;
  return arena?.remaining===0&&arena.modes.some(mode=>mode.id==='expert'&&mode.available)
    &&!document.getElementById('weeklyChallengeStart').disabled;
 },undefined,{timeout:120000});
 assert.equal(await choice.inputValue(),'expert');
 assert.ok(await start.isEnabled());
 await start.click();
 await drive.waitNode(arena);
 const before=await frame();
 assert.equal(before.weeklyBoss.difficulty,'最上級');
 assert.equal(before.weeklyBoss.maxhp,picked.hp);
 await driveAndrius(page);
 await page.evaluate(()=>{window.andriusFight=true});
 await page.waitForFunction(()=>window.andriusResult,undefined,{timeout:60000});
 const play=await page.evaluate(()=>window.andriusResult);
 assert.ok(play.won&&!play.returns,JSON.stringify(play));
 const after=await frame();
 const expectedReward={xp:picked.xp+picked.firstXp,mora:picked.mora+picked.firstMora,first:true};
 assert.deepEqual(after.weeklyBoss.reward,expectedReward);
 assert.equal(after.progression.baseXp-before.progression.baseXp,expectedReward.xp);
 assert.equal(after.progression.overflowXp-before.progression.overflowXp,expectedReward.xp);
 assert.equal(after.mora-before.mora,expectedReward.mora);
 assert.equal(after.endgame.weekly[expert].clears,1);
 assert.deepEqual(after.endgame.bosses[normal],seed.endgame.bosses[normal]);
 const result=page.locator('#weeklyChallengeResult');
 assert.match(await result.textContent(),/最上級 勝利.*初回追加分/);
 await result.screenshot({path:output+'/expert-result.png'});

 await drive.cross(road);
 await drive.walk(940);
 await desk.waitFor();
 assert.equal(await choice.inputValue(),'expert');
 assert.match(await page.locator('#weeklyChallengeRecord').textContent(),/最上級の戦績.*1勝/);
 assert.doesNotMatch(await page.locator('#weeklyChallengeDetails').textContent(),/初回追加/);
 await page.locator('#saveProgress').click();
 await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('冒険を保存しました'));
 const saved=JSON.parse(await page.evaluate(()=>localStorage.getItem('maple-lua-lab.checkpoint.v1')));
 assert.ok(saved.weeklyBosses[id].waitTicks>0);
 for(const [key,quest] of Object.entries(seed.story.quests)){
  if(quest.status==='complete')assert.deepEqual(saved.story.quests[key],quest,key);
 }
 assert.equal(saved.companion,seed.companion);
 assert.equal(saved.weapons.equipped.traveler,seed.weapons.equipped.traveler);
 await page.reload();
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#loadProgress').click();
 await drive.waitNode(town);
 await roadEntrance();
 assert.equal(await choice.inputValue(),'expert');
 assert.ok(await start.isDisabled());
 assert.match(await page.locator('#weeklyChallengeRecord').textContent(),/最上級の戦績.*1勝/);
 await desk.screenshot({path:output+'/expert-restored.png'});
 assert.deepEqual(errors,[]);
 await fs.writeFile(output+'/first-expert-save.json',JSON.stringify(saved)+'\n');
 const proof={sourceSha256:createHash('sha256').update(raw).digest('hex'),guide:[road,arena],
  level:saved.progression.level,normalWins:saved.endgame.bosses[normal].clears,
  expertWins:saved.endgame.weekly[expert].clears,firstReward:expectedReward,
  baseReward:{xp:picked.xp,mora:picked.mora},firstWait:entrance.weeklyDesk.remaining,
  restoredWait:(await frame()).weeklyDesk.remaining,attack:before.actors[0].atk,
  recordAfterReload:true,mobileDeskFits:true,play,errors};
 await fs.writeFile(output+'/first-expert-browser.json',JSON.stringify(proof,null,2)+'\n');
 console.log(proof);
}catch(error){
 const f=await frame();
 console.error({node:f?.story?.node,desk:f?.weeklyDesk,boss:f?.weeklyBoss,attack:f?.actors?.[0]?.atk,errors});
 await page.screenshot({path:output+'/first-expert-failure.png'});
 throw error;
}finally{await browser.close()}
