import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const url=process.env.LAB_URL||'http://127.0.0.1:8973/';
const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const nodes=Object.fromEntries(graph.nodes.map(node=>[node.id,node]));
const browser=await chromium.launch({headless:true,channel:'chrome'});
const errors=[];
const number=new Intl.NumberFormat('ja-JP');
const saveKey='maple-lua-lab.checkpoint.v1';

async function play(){
 const context=await browser.newContext({viewport:{width:1240,height:900}});
 const page=await context.newPage();
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto(url);
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#expRanking summary').click();
 await page.locator('#startRankedAdventure').click();
 await page.waitForFunction(()=>window.lab.frame.rankedAdventure&&window.lab.frame.story.node==='mond-town');
 const travel=waypointDriver(page,nodes);
 const initial=await page.evaluate(()=>window.lab.frame.progression.baseXp);
 await travel.cross('mond-road');
 await page.locator('#auto').click();
 await page.waitForFunction(xp=>window.lab.frame.progression.baseXp>xp,initial);
 await page.locator('#auto').click();
 await page.waitForFunction(()=>!window.lab.frame.auto);
 await travel.cross('mond-town');
 await page.locator('#saveProgress').click();
 await page.waitForFunction(key=>Boolean(JSON.parse(localStorage.getItem(key))?.rankProof),saveKey);
 const save=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),saveKey);
 const xp=save.progression.baseXp;
 assert(xp>0);
 await page.locator('#refreshExpRanking').click();
 await page.waitForFunction(text=>document.getElementById('expRankingPlayer').textContent.includes(text),number.format(xp)+' EXP');
 return {page,xp,save};
}

try{
 const first=await play();
 const second=await play();
 const {page,xp,save}=first;
 await page.locator('#refreshExpRanking').click();
 await page.waitForFunction(()=>document.querySelectorAll('#expRankingRows tr').length===2);
 const rows=page.locator('#expRankingRows tr');
 assert.equal(await rows.filter({hasText:'あなた'}).count(),1);
 await page.locator('#expRankingScope').selectOption('weekly');
 assert.match(await page.locator('#expRankingWeek').textContent(),/月曜 04:00 日本時間/);
 assert.equal(await rows.count(),2);
 await page.locator('#expRanking').screenshot({path:'evidence/exp-ranking-local-browser.png'});
 await page.setViewportSize({width:390,height:844});
 const mobileFits=await page.locator('#expRanking').evaluate(e=>e.scrollWidth<=e.clientWidth+1);
 assert(mobileFits);

 await page.locator('#importSave').setInputFiles({
  name:'maple-lab-save.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(save))
 });
 await page.waitForFunction(()=>document.getElementById('saveStatus').textContent.includes('ファイルの進行で町から再開'));
 assert.equal(await page.evaluate(()=>window.lab.frame.rankedAdventure),true);
 assert.equal(await page.evaluate(()=>window.lab.frame.progression.baseXp),xp);
 const restored=await page.evaluate(async()=>await (await fetch('/api/exp-ranking')).json());
 assert.equal(restored.total.own.score,xp);
 assert.equal(restored.weekly.own.score,xp);

 page.once('dialog',dialog=>dialog.accept());
 await page.locator('#startRankedAdventure').click();
 await page.waitForFunction(()=>window.lab.frame.rankedAdventure&&window.lab.frame.progression.baseXp===0);
 await page.waitForFunction(()=>document.getElementById('expRankingStatus').textContent.includes('更新しました'));
 const retained=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).progression.baseXp,saveKey);
 assert.equal(retained,xp);
 assert.equal(await page.locator('#startRankedAdventure').isEnabled(),true);

 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/exp-ranking-local-browser.json',JSON.stringify({
  twoProfiles:true,earnedBaseXP:[xp,second.xp],rankedRestore:true,weeklySwitch:true,
  freshStartPreservesCheckpoint:true,mobileFits,errors
 },null,2)+'\n');
 console.log('Chrome passed two fresh ranked adventures, weekly view, 390px and save import.');
}finally{
 await browser.close();
}
