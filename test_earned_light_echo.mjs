import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const output='work/earned-light-echo';
const file=process.argv[2]??output+'/lv170-save.json';
const raw=await fs.readFile(file);
const seed=JSON.parse(raw);
assert.equal(seed.progression.level,170);
const station='white-pass-station',town='snezhnaya-hub',channel='aurora-steam-channel';
const route=['aurora-ice-cut','aurora-ice-shelf',channel];
const quest='growth-light-echo';
const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const nodes=Object.fromEntries(graph.nodes.map(node=>[node.id,node]));
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1280,height:960}});
const drive=waypointDriver(page,nodes,{walkTimeout:22000});
const game=page.locator('#game'),errors=[];
const frame=()=>page.evaluate(()=>window.lab.frame);
page.on('pageerror',error=>errors.push(error.message));

async function fast(node){
 await page.getByRole('button',{name:'拠点へ：'+nodes[node].name,exact:true}).click();
 await drive.waitNode(node);
}

async function compareReady(){
 const mode=page.locator('#renderMode');
 await page.locator('#pause').click();
 await page.waitForFunction(()=>window.lab.frame.paused);
 const png=await frame();
 const marks=f=>f.draws.filter(d=>d.color==='#c6b0fa'||d.color==='#f4eaff');
 assert.ok(png.echoReady);
 assert.equal(marks(png).length,6);
 await game.screenshot({path:output+'/recorded-png.png'});
 await mode.selectOption('rect');
 await page.waitForFunction(n=>window.lab.frame.commands>n*8,png.commands);
 const standard=await frame();
 await mode.selectOption('h32c16');
 await page.waitForFunction(n=>window.lab.frame.commands<n*.66,standard.commands);
 const light=await frame();
 for(const f of [standard,light]){
  assert.equal(f.t,png.t);
  assert.equal(f.lightForm.seconds,png.lightForm.seconds);
  assert.deepEqual(marks(f),marks(png));
 }
 await game.screenshot({path:output+'/recorded-16.png'});
 await mode.selectOption('sprite');
 await page.waitForFunction(n=>window.lab.frame.commands===n,png.commands);
 await page.locator('#pause').click();
 await page.waitForFunction(()=>!window.lab.frame.paused);
 return {png:png.commands,standard:standard.commands,light:light.commands};
}

try{
 await page.goto(process.env.LAB_URL??'http://127.0.0.1:8941/');
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#importSave').setInputFiles(file);
 await drive.waitNode(station);
 await fast(town);
 await drive.accept(quest);
 await page.getByText('スキル装着・全100技の制作状況',{exact:true}).click();
 await page.getByLabel('枠1の1番目',{exact:true}).selectOption('SK09');
 await page.getByLabel('枠2の1番目',{exact:true}).selectOption('SK59');
 await page.getByRole('button',{name:'8枠を適用',exact:true}).click();
 await page.waitForFunction(()=>window.lab.frame.loadout[0][0]==='SK09'&&window.lab.frame.loadout[1][0]==='SK59');
 await fast(station);
 await game.click();
 await page.keyboard.press('KeyM');
 await page.locator('#worldAtlas').waitFor();
 await page.locator('#atlasField').selectOption(channel);
 await page.waitForFunction(id=>window.lab.frame.worldMap?.selected?.id===id,channel);
 const guide=(await frame()).worldMap.guide;
 assert.equal(guide.status,'ready');
 assert.deepEqual(guide.stops.map(stop=>stop.id),route);
 await page.keyboard.press('Escape');
 await page.locator('#worldAtlas').waitFor({state:'hidden'});
 for(const node of route)await drive.cross(node);
 const enemies=(await frame()).total;
 assert.equal(enemies,28);
 if((await frame()).gauge<60){
  await drive.walk(285);
  await page.locator('#auto').click();
  await page.waitForFunction(()=>window.lab.frame.gauge>=60);
  await page.locator('#auto').click();
 }
 await page.locator('#allyFire').click();
 await page.waitForFunction(()=>Boolean(window.lab.frame.holdAllyFire));
 await drive.walk(300);
 await game.click();
 await page.waitForFunction(()=>window.lab.frame.actors[0].lock===0);
 await page.keyboard.press('KeyQ');
 await page.waitForFunction(()=>window.lab.frame.lightForm.seconds>0&&window.lab.frame.actors[0].lock===0);
 await page.keyboard.press('Digit2');
 await page.waitForFunction(()=>window.lab.frame.skillNotice?.includes('先に反響'));
 const rejected=await frame();
 assert.equal(rejected.story.quests[quest].count,0);
 assert.equal(rejected.actors[0].cd.SK59??0,0);
 await page.keyboard.press('Digit1');
 await page.waitForFunction(()=>window.lab.frame.echoSource==='SK09'&&window.lab.frame.echoReady);
 assert.equal((await frame()).story.quests[quest].count,0);
 assert.match(await page.locator('#echoStatus').textContent(),/雷撃.*使用可能/);
 const commands=await compareReady();
 const originalX=(await drive.actor()).x;
 await drive.walk(980);
 assert.ok((await drive.actor()).x>originalX+500);
 assert.ok((await frame()).lightForm.seconds>0);
 await game.click();
 await page.keyboard.press('Digit2');
 await page.waitForFunction(()=>window.lab.frame.actors[0].cd.SK59>0&&!window.lab.frame.echoReady);
 await drive.count(quest,1);
 const landed=await frame();
 assert.equal(landed.story.growth['light-echo'],true);
 assert.ok(landed.hits>rejected.hits);
 assert.equal(landed.growthTrial,undefined);
 await game.screenshot({path:output+'/echo-hit.png'});
 await page.locator('#allyFire').click();
 await page.waitForFunction(()=>!window.lab.frame.holdAllyFire);
 await fast(town);
 assert.equal((await frame()).echoSource,undefined);
 const before=await frame();
 await drive.report(quest);
 const after=await frame();
 const rewards=[after.progression.questXp-before.progression.questXp,after.mora-before.mora,
  after.inventory.upgradeOre-before.inventory.upgradeOre];
 assert.deepEqual(rewards,[1700000,15000,1]);
 await page.locator('#saveProgress').click();
 await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('冒険を保存しました'));
 const saved=JSON.parse(await page.evaluate(()=>localStorage.getItem('maple-lua-lab.checkpoint.v1')));
 await page.reload();
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#loadProgress').click();
 await drive.waitNode(town);
 assert.equal((await frame()).story.quests[quest].status,'complete');
 const prior=Object.entries(seed.story.quests).filter(([,record])=>record.status==='complete');
 for(const [id,record] of prior)assert.deepEqual(saved.story.quests[id],record,id);
 const inventory=new Set(saved.inventory.items.map(item=>item.id));
 for(const item of seed.inventory.items)assert.ok(inventory.has(item.id),item.id);
 assert.equal(saved.companion,'mitya');
 assert.equal(saved.weapons.equipped.traveler,'SW07');
 assert.ok(saved.story.visited[channel]);
 assert.deepEqual(errors,[]);
 const proof={sourceSha256:createHash('sha256').update(raw).digest('hex'),level:saved.progression.level,
  guide:route,enemies,noEchoBeforeSource:true,liveEchoHit:true,sourceSkill:'SK09',echoSkill:'SK59',
  recordClearsOnTravel:true,commands,rewards,priorQuests:prior.length,visitedChannel:true,
  companion:saved.companion,weapon:saved.weapons.equipped.traveler,errors};
 await fs.writeFile(output+'/complete.json',JSON.stringify(saved)+'\n');
 await fs.writeFile(output+'/browser.json',JSON.stringify(proof,null,2)+'\n');
 console.log(proof);
}catch(error){
 const f=await frame();
 console.error({node:f?.story?.node,actor:f?.actors?.[0],gauge:f?.gauge,light:f?.lightForm,
  echoSource:f?.echoSource,echoReady:f?.echoReady,notice:f?.skillNotice,quest:f?.story?.quests?.[quest],errors});
 await page.screenshot({path:output+'/failure.png'});
 throw error;
}finally{await browser.close()}
