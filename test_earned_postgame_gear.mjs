import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const output='work/earned-postgame-goal';
const mode=process.argv[2]??'gear';
assert.ok(['gear','ridge'].includes(mode));
const file=process.argv[3]??(mode==='gear'?'work/earned-seven-strike/complete.json':output+'/lv190-save.json');
const raw=await fs.readFile(file);
const seed=JSON.parse(raw);
const quest='growth-next-goal',town='mond-town',station='white-pass-station';
const trail=['aurora-ice-cut','aurora-ice-shelf','aurora-steam-channel','aurora-mineral-terraces',
 'dawn-vein-mine','dawn-vein-deep','dawn-glass-ridge'];
const ridge=trail.at(-1);
const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const nodes=Object.fromEntries(graph.nodes.map(node=>[node.id,node]));
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:mode==='gear'?{width:390,height:844}:{width:1280,height:960}});
const drive=waypointDriver(page,nodes,{walkTimeout:22000});
const game=page.locator('#game'),errors=[];
const frame=()=>page.evaluate(()=>window.lab.frame);
page.on('pageerror',error=>errors.push(error.message));

async function fast(node){
 if(await drive.node()===node)return;
 await page.getByRole('button',{name:'拠点へ：'+nodes[node].name,exact:true}).click();
 await drive.waitNode(node);
}

async function checkpoint(node){
 await page.locator('#saveProgress').click();
 await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('冒険を保存しました'));
 const saved=JSON.parse(await page.evaluate(()=>localStorage.getItem('maple-lua-lab.checkpoint.v1')));
 await page.reload();
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#loadProgress').click();
 await drive.waitNode(node);
 assert.equal((await frame()).story.quests[quest].status,'complete');
 assert.equal(saved.weapons.equipped.traveler,'SW07');
 assert.equal(saved.companion,'mitya');
 const prior=Object.entries(seed.story.quests).filter(([,record])=>record.status==='complete');
 for(const [id,record] of prior)assert.deepEqual(saved.story.quests[id],record,id);
 const inventory=new Set(saved.inventory.items.map(item=>item.id));
 for(const item of seed.inventory.items)assert.ok(inventory.has(item.id),item.id);
 return {saved,priorQuests:prior.length};
}

async function verifyUpgrade(){
 await fast(town);
 assert.equal((await frame()).progression.level,180);
 await drive.accept(quest);
 const candidates=page.locator('#endgameGearCandidates');
 await candidates.waitFor({state:'hidden'});
 await page.getByRole('button',{name:'狙うセットの装備を更新',exact:true}).click();
 await candidates.waitFor();
 assert.ok(await candidates.evaluate(el=>el.getBoundingClientRect().right<=390&&el.scrollWidth<=el.clientWidth));
 const before=await frame();
 const gear=before.endgameDesk.gear;
 assert.equal(gear.set,'剣闘士のフィナーレ');
 const feather=Object.values(gear.items).find(item=>item.slot===2);
 assert.ok(feather.after>feather.before);
 assert.equal(before.story.quests[quest].count,1);
 await candidates.screenshot({path:output+'/gear-candidates.png'});
 await candidates.locator(`[data-gear-candidate="${feather.id}"]`).click();
 const preview=page.locator('#artifactPreview');
 await preview.getByRole('button',{name:'比較した品を装備',exact:true}).waitFor();
 const comparison=(await frame()).artifactPreview;
 assert.equal(comparison.before.stat,feather.before);
 assert.equal(comparison.after.stat,feather.after);
 assert.equal((await frame()).story.quests[quest].count,1);
 await preview.screenshot({path:output+'/gear-compare.png'});
 await preview.getByRole('button',{name:'比較した品を装備',exact:true}).click();
 await drive.count(quest,2);
 assert.equal((await frame()).inventory.items.find(item=>item.id===feather.id).owner,1);
 await candidates.waitFor({state:'hidden'});
 const upgraded=await frame();
 assert.ok(upgraded.actors[0].atk>before.actors[0].atk);
 await drive.report(quest);
 const reported=await frame();
 const reward=[reported.progression.questXp-upgraded.progression.questXp,reported.mora-upgraded.mora,
  reported.inventory.upgradeOre-upgraded.inventory.upgradeOre];
 assert.deepEqual(reward,[0,20000,3]);
 const {saved,priorQuests}=await checkpoint(town);
 assert.equal(saved.endgame.goal,'gear');
 assert.equal((await frame()).actors[0].atk,upgraded.actors[0].atk);
 await fs.writeFile(output+'/goal-reported.json',JSON.stringify(saved)+'\n');
 return {level:saved.progression.level,priorQuests,set:gear.set,candidate:feather.id,
  featherMain:[feather.before,feather.after],travelerAttack:[before.actors[0].atk,upgraded.actors[0].atk],
  previewDidNotCompleteGoal:true,mobileCandidatesFit:true,reward,companion:saved.companion};
}

async function verifyRidge(){
 await drive.waitNode(station);
 const initial=await frame();
 assert.equal(initial.progression.level,190);
 await game.click();
 await page.keyboard.press('KeyM');
 await page.locator('#worldAtlas').waitFor();
 await page.locator('#atlasField').selectOption(ridge);
 await page.waitForFunction(id=>window.lab.frame.worldMap?.selected?.id===id,ridge);
 const guide=(await frame()).worldMap.guide;
 assert.equal(guide.status,'ready');
 assert.deepEqual(guide.stops.map(stop=>stop.id),trail);
 await page.keyboard.press('Escape');
 await page.locator('#worldAtlas').waitFor({state:'hidden'});
 for(const node of trail)await drive.cross(node);
 const arrival=await frame();
 assert.equal(arrival.total,28);
 assert.equal(arrival.actors[0].atk,initial.actors[0].atk);
 await game.screenshot({path:output+'/dawn-ridge.png'});
 const {saved,priorQuests}=await checkpoint(station);
 assert.ok(saved.story.visited[ridge]&&saved.story.visited['dawn-vein-deep']);
 assert.equal((await frame()).actors[0].atk,initial.actors[0].atk);
 await fs.writeFile(output+'/complete.json',JSON.stringify(saved)+'\n');
 return {level:saved.progression.level,priorQuests,guide:trail,enemies:arrival.total,visitedRidge:true,
  travelerAttack:initial.actors[0].atk,companion:saved.companion,weapon:saved.weapons.equipped.traveler};
}

try{
 await fs.mkdir(output,{recursive:true});
 await page.goto(process.env.LAB_URL??'http://127.0.0.1:8941/');
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#importSave').setInputFiles(file);
 await page.waitForFunction(level=>window.lab.frame.progression?.level===level,seed.progression.level);
 const details=mode==='gear'?await verifyUpgrade():await verifyRidge();
 assert.deepEqual(errors,[]);
 const proof={sourceSha256:createHash('sha256').update(raw).digest('hex'),...details,errors};
 await fs.writeFile(`${output}/${mode}-browser.json`,JSON.stringify(proof,null,2)+'\n');
 console.log(proof);
}catch(error){
 const f=await frame();
 console.error({node:f?.story?.node,quest:f?.story?.quests?.[quest],gear:f?.endgameDesk?.gear,
  atk:f?.actors?.[0]?.atk,errors});
 await page.screenshot({path:`${output}/${mode}-failure.png`});
 throw error;
}finally{await browser.close()}
