import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const output='work/earned-light-aurora-shelf';
const station='white-pass-station',town='mond-town',camp='dragonspine-camp',depth='dragonspine-depth';
const cut='aurora-ice-cut',shelf='aurora-ice-shelf',release='growth-light-release',branch='growth-branch-visit';
const source=process.argv[2];
assert.ok(source,'Pass the earned Lv160 save, or --shelf for the continued Lv165 save');
const checkingShelf=source==='--shelf';
const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const nodes=Object.fromEntries(graph.nodes.map(n=>[n.id,n]));
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1280,height:960}});
const drive=waypointDriver(page,nodes,{walkTimeout:22000});
const game=page.locator('#game'),errors=[];
page.on('pageerror',error=>errors.push(error.message));
const frame=()=>page.evaluate(()=>window.lab.frame);

async function fast(node){
 await page.getByRole('button',{name:`拠点へ：${nodes[node].name}`,exact:true}).click();
 await drive.waitNode(node);
}

async function heldAlly(value){
 if(Boolean((await frame()).holdAllyFire)!==value)await page.locator('#allyFire').click();
 await page.waitForFunction(value=>Boolean(window.lab.frame.holdAllyFire)===value,value);
}

async function checkpoint(node){
 await page.locator('#saveProgress').click();
 await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('冒険を保存しました'));
 const data=await page.evaluate(()=>localStorage.getItem('maple-lua-lab.checkpoint.v1'));
 await page.reload();
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#loadProgress').click();
 await drive.waitNode(node);
 return JSON.parse(data);
}

async function compareAura(){
 const mode=page.locator('#renderMode');
 await page.locator('#pause').click();
 await page.waitForFunction(()=>window.lab.frame.paused);
 const png=await frame();
 const glow=f=>f.draws.filter(d=>d.color==='#ffd68cba');
 assert.equal(glow(png).length,4);
 await game.screenshot({path:`${output}/light-png.png`});
 await mode.selectOption('rect');
 await page.waitForFunction(n=>window.lab.frame.commands>n*8,png.commands);
 const standard=await frame();
 await mode.selectOption('h32c16');
 await page.waitForFunction(n=>window.lab.frame.commands<n*.66,standard.commands);
 const light=await frame();
 for(const f of [standard,light]){
  assert.equal(f.t,png.t);
  assert.equal(f.lightForm.seconds,png.lightForm.seconds);
  assert.deepEqual(glow(f),glow(png));
 }
 await game.screenshot({path:`${output}/light-16.png`});
 await mode.selectOption('sprite');
 await page.locator('#pause').click();
 await page.waitForFunction(()=>!window.lab.frame.paused);
 await page.waitForFunction(trails=>{
  const f=window.lab.frame;
  return f.lightForm.seconds>0&&f.draws.some((d)=>d.color==='#ffd68cba'&&!trails.includes(d.y));
 },glow(png).map(d=>d.y));
 return {png:png.commands,standard:standard.commands,light:light.commands};
}

function checkPrior(seed,saved){
 const prior=Object.entries(seed.story.quests).filter(([,q])=>q.status==='complete');
 for(const [id,q] of prior)assert.deepEqual(saved.story.quests[id],q,id);
 const inventory=new Set(saved.inventory.items.map(i=>i.id));
 for(const item of seed.inventory.items)assert.ok(inventory.has(item.id),item.id);
 assert.equal(saved.companion,seed.companion);
 assert.equal(saved.weapons.equipped.traveler,'SW07');
 return prior.length;
}

async function quests(seed,hash){
 await drive.waitNode(station);
 assert.equal((await frame()).progression.level,160);
 await fast(town);
 await drive.accept(release);
 await drive.accept(branch);
 await fast(station);
 await drive.cross(cut);
 await drive.walk(285);
 if((await frame()).gauge<60){
  await page.locator('#auto').click();
  await page.waitForFunction(()=>window.lab.frame.gauge>=60);
  await page.locator('#auto').click();
 }
 await heldAlly(true);
 await page.waitForFunction(()=>window.lab.frame.actors[0].lock===0);
 const gauge=(await frame()).gauge;
 await game.click();
 await page.keyboard.press('KeyQ');
 await drive.count(release,1);
 assert.equal((await frame()).gauge,gauge-60);
 const commands=await compareAura();
 await game.click();
 await page.keyboard.down('KeyD');
 await page.keyboard.down('KeyJ');
 try{await drive.count(release,2)}finally{
  await page.keyboard.up('KeyJ');
  await page.keyboard.up('KeyD');
 }
 await fast(town);
 const start=await frame();
 await drive.report(release);
 const first=await frame();
 for(const node of ['mond-road','mond-border',camp,depth])await drive.cross(node);
 await drive.walk(540);
 await page.waitForFunction(()=>window.lab.frame.growthBranchObserve);
 assert.ok((await frame()).draws.some(d=>d.color==='#b8e9f0'&&d.w===8));
 await game.screenshot({path:`${output}/observation.png`});
 await page.getByRole('button',{name:'高難度地域の観測地点を調べる',exact:true}).click();
 await drive.count(branch,1);
 assert.match((await frame()).storyNotice,/地形を記録/);
 await heldAlly(false);
 await fast(town);
 const before=await frame();
 await drive.report(branch);
 const after=await frame();
 const reward=(a,b)=>[b.progression.questXp-a.progression.questXp,b.mora-a.mora,b.inventory.upgradeOre-a.inventory.upgradeOre];
 assert.deepEqual(reward(start,first),[1150000,10000,1]);
 assert.deepEqual(reward(before,after),[1300000,12000,1]);
 const saved=await checkpoint(town);
 const priorQuests=checkPrior(seed,saved);
 assert.ok(saved.story.growth['light-normal']&&saved.story.growth['branch-practice']);
 assert.ok([release,branch].every(id=>saved.story.quests[id].status==='complete'));
 await fs.writeFile(`${output}/light-reports.json`,JSON.stringify(saved)+'\n');
 return {sourceSha256:hash,level:saved.progression.level,priorQuests,practice:false,
  consumedGauge:60,auraMatchesAndPauses:true,liveNormalHit:true,dragonspineObserved:true,commands,
  rewards:[reward(start,first),reward(before,after)],errors};
}

async function shelfRoute(seed){
 await drive.waitNode(station);
 assert.equal((await frame()).progression.level,165);
 await game.click();
 await page.keyboard.press('KeyM');
 await page.locator('#worldAtlas').waitFor();
 await page.locator('#atlasField').selectOption(shelf);
 await page.waitForFunction(id=>window.lab.frame.worldMap?.selected?.id===id,shelf);
 const guide=(await frame()).worldMap.guide;
 assert.equal(guide.status,'ready');
 assert.deepEqual(guide.stops.map(s=>s.id),[cut,shelf]);
 await page.keyboard.press('Escape');
 await page.locator('#worldAtlas').waitFor({state:'hidden'});
 await drive.cross(cut);
 await drive.cross(shelf);
 const current=await frame();
 assert.equal(current.total,28);
 await game.screenshot({path:`${output}/ice-shelf.png`});
 const saved=await checkpoint(station);
 const priorQuests=checkPrior(seed,saved);
 assert.ok(saved.story.visited[shelf]);
 await fs.writeFile(`${output}/complete.json`,JSON.stringify(saved)+'\n');
 return {level:saved.progression.level,guide:guide.stops.map(s=>s.id),enemies:current.total,
  restoredAt:station,visitedShelf:saved.story.visited[shelf],priorQuests,
  companion:saved.companion,weapon:saved.weapons.equipped.traveler,errors};
}

try{
 const file=checkingShelf?`${output}/lv165-save.json`:source;
 const raw=await fs.readFile(file);
 const seed=JSON.parse(raw);
 await page.goto(process.env.LAB_URL??'http://127.0.0.1:8941/');
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#importSave').setInputFiles(file);
 const proof=checkingShelf?await shelfRoute(seed):await quests(seed,createHash('sha256').update(raw).digest('hex'));
 assert.deepEqual(errors,[]);
 await fs.writeFile(`${output}/${checkingShelf?'shelf':'light'}-browser.json`,JSON.stringify(proof,null,2)+'\n');
 console.log(proof);
}catch(error){
 console.error(await page.evaluate(()=>({node:window.lab?.frame?.story?.node,actor:window.lab?.frame?.actors[0],
   gauge:window.lab?.frame?.gauge,observation:window.lab?.frame?.growthBranchObserve,notice:window.lab?.frame?.storyNotice})),errors);
 throw error;
}finally{await browser.close()}
