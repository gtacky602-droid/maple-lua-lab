import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const output='work/earned-seven-strike';
const file=process.argv[2]??output+'/lv180-save.json';
const raw=await fs.readFile(file);
const seed=JSON.parse(raw);
assert.equal(seed.progression.level,180);
const station='white-pass-station',town='snezhnaya-hub',mine='dawn-vein-mine';
const trail=['aurora-ice-cut','aurora-ice-shelf','aurora-steam-channel','aurora-mineral-terraces',mine];
const quest='growth-seven-strike';
const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const nodes=Object.fromEntries(graph.nodes.map(node=>[node.id,node]));
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1280,height:960}});
const drive=waypointDriver(page,nodes,{walkTimeout:22000});
const game=page.locator('#game'),mode=page.locator('#renderMode'),errors=[];
const frame=()=>page.evaluate(()=>window.lab.frame);
const palette=['#ff8557','#74d8ff','#ace674','#ffce66','#bc8cf5','#79ead7','#fba8cc'];
page.on('pageerror',error=>errors.push(error.message));

async function fast(node){
 await page.getByRole('button',{name:'拠点へ：'+nodes[node].name,exact:true}).click();
 await drive.waitNode(node);
}

async function capturePillars(){
 // Stop during the cast after the staggered rise has brought all seven pillars into view.
 await page.waitForFunction(()=>{
  const f=window.lab.frame;
  if(!(f.ultimate?.seconds>0&&f.ultimate.seconds<=2.30))return false;
  window.lab.action('pause');
  return true;
 });
 await page.waitForFunction(()=>window.lab.frame.paused);
 const png=await frame();
 const marks=f=>f.draws.filter(d=>d.kind==='rect'&&(palette.includes(d.color)||d.color==='#fff9dc'));
 const cores=marks(png).filter(d=>d.w===13&&d.h===300);
 assert.deepEqual(cores.map(d=>d.color),palette);
 assert.equal(marks(png).length,56);
 await game.screenshot({path:output+'/pillars-png.png'});
 await mode.selectOption('rect');
 await page.waitForFunction(n=>window.lab.frame.commands>n*8,png.commands);
 const standard=await frame();
 await mode.selectOption('h32c16');
 await page.waitForFunction(n=>window.lab.frame.commands<n*.66,standard.commands);
 const light=await frame();
 for(const f of [standard,light]){
  assert.equal(f.t,png.t);
  assert.deepEqual(f.ultimate,png.ultimate);
  assert.equal(f.damage,png.damage);
  assert.deepEqual(marks(f),marks(png));
 }
 await game.screenshot({path:output+'/pillars-16.png'});
 await mode.selectOption('sprite');
 await page.waitForFunction(n=>window.lab.frame.commands===n,png.commands);
 await page.locator('#pause').click();
 await page.waitForFunction(()=>!window.lab.frame.paused);
 return {png:png.commands,standard:standard.commands,light:light.commands,pillars:cores.length,
  effectCommands:marks(png).length};
}

try{
 await page.goto(process.env.LAB_URL??'http://127.0.0.1:8941/');
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#importSave').setInputFiles(file);
 await drive.waitNode(station);
 await fast(town);
 await drive.accept(quest);
 await page.getByText('スキル装着・全100技の制作状況',{exact:true}).click();
 await page.getByLabel('枠3の1番目',{exact:true}).selectOption('SK60');
 await page.getByLabel('枠3の2番目',{exact:true}).selectOption('');
 await page.getByLabel('枠3の3番目',{exact:true}).selectOption('');
 await page.getByRole('button',{name:'8枠を適用',exact:true}).click();
 await page.waitForFunction(()=>window.lab.frame.loadout[2].join()==='SK60');
 await fast(station);
 await game.click();
 await page.keyboard.press('KeyM');
 await page.locator('#worldAtlas').waitFor();
 await page.locator('#atlasField').selectOption(mine);
 await page.waitForFunction(id=>window.lab.frame.worldMap?.selected?.id===id,mine);
 const guide=(await frame()).worldMap.guide;
 assert.equal(guide.status,'ready');
 assert.deepEqual(guide.stops.map(stop=>stop.id),trail);
 await page.keyboard.press('Escape');
 await page.locator('#worldAtlas').waitFor({state:'hidden'});
 for(const node of trail)await drive.cross(node);
 const atMine=await frame();
 assert.ok(atMine.total>0);
 await page.locator('#allyFire').click();
 await page.waitForFunction(()=>Boolean(window.lab.frame.holdAllyFire));
 await drive.walk(660);
 const before=await frame();
 assert.equal(before.gauge,100);
 assert.equal(before.lightForm.seconds,0);
 assert.equal(before.growthTrial,undefined);
 await game.click();
 await page.keyboard.press('Digit3');
 await page.waitForFunction(()=>window.lab.frame.ultimate?.seconds>0&&window.lab.frame.gauge===0);
 const commands=await capturePillars();
 await page.waitForFunction(()=>!window.lab.frame.ultimate);
 const after=await frame();
 assert.equal(after.gauge,0);
 assert.equal(after.story.quests[quest].count,1);
 assert.equal(after.story.growth['seven-strike'],true);
 assert.ok(after.damage>before.damage&&after.hits>before.hits);
 assert.ok(!after.draws.some(d=>d.color==='#ffc977'&&d.w===106));
 await page.locator('#allyFire').click();
 await page.waitForFunction(()=>!window.lab.frame.holdAllyFire);
 await fast(town);

 // The mine enemies fall during the pulses. Confirm the single finisher
 // in Mitya's isolated practice, whose targets survive the broad attack.
 const practiceEntry=await frame();
 await page.locator(`[data-quest="${quest}"]`).getByRole('button',{name:'練習場に入る',exact:true}).click();
 await page.waitForFunction(()=>window.lab.frame.growthTrial?.skill==='SK60');
 await game.click();
 await page.keyboard.down('KeyJ');
 try{await page.waitForFunction(()=>window.lab.frame.gauge===100)}
 finally{await page.keyboard.up('KeyJ')}
 await page.keyboard.press('Digit3');
 await page.waitForFunction(()=>window.lab.frame.ultimate?.seconds>0&&window.lab.frame.gauge<30);
 await page.waitForFunction(()=>{
  const f=window.lab.frame;
  if(f.ultimate||!f.draws.some(d=>d.color==='#ffc977'&&d.w===106))return false;
  window.lab.action('pause');
  return true;
 });
 await page.waitForFunction(()=>window.lab.frame.paused);
 const finish=await frame();
 assert.equal(finish.draws.filter(d=>d.color==='#ffc977'&&d.w===106).length,1);
 await game.screenshot({path:output+'/finisher.png'});
 await page.locator('#growthTrialHud').getByRole('button',{name:'練習を終える',exact:true}).click();
 await page.waitForFunction(()=>!window.lab.frame.growthTrial);
 const beforeReport=await frame();
 assert.equal(beforeReport.gauge,practiceEntry.gauge);
 assert.equal(beforeReport.damage,practiceEntry.damage);
 assert.equal(beforeReport.mora,practiceEntry.mora);
 assert.deepEqual(beforeReport.inventory,practiceEntry.inventory);
 await drive.report(quest);
 const afterReport=await frame();
 const rewards=[afterReport.progression.questXp-beforeReport.progression.questXp,afterReport.mora-beforeReport.mora,
  afterReport.inventory.upgradeOre-beforeReport.inventory.upgradeOre];
 assert.deepEqual(rewards,[2400000,20000,1]);
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
 assert.ok(saved.story.visited[mine]);
 assert.deepEqual(errors,[]);
 const proof={sourceSha256:createHash('sha256').update(raw).digest('hex'),level:saved.progression.level,
  guide:trail,enemies:atMine.total,gaugeSpent:100,livePulsesHit:true,liveFinisherAbsent:true,
  singlePracticeFinisher:true,practiceResourcesIsolated:true,hits:after.hits-before.hits,
  damage:after.damage-before.damage,commands,rewards,priorQuests:prior.length,visitedMine:true,
  companion:saved.companion,weapon:saved.weapons.equipped.traveler,errors};
 await fs.writeFile(output+'/complete.json',JSON.stringify(saved)+'\n');
 await fs.writeFile(output+'/browser.json',JSON.stringify(proof,null,2)+'\n');
 console.log(proof);
}catch(error){
 const f=await frame();
 console.error({node:f?.story?.node,actor:f?.actors?.[0],gauge:f?.gauge,ultimate:f?.ultimate,
  notice:f?.skillNotice,quest:f?.story?.quests?.[quest],errors});
 await page.screenshot({path:output+'/failure.png'});
 throw error;
}finally{await browser.close()}
