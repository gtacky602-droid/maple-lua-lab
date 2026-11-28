import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const output=process.argv[2]??'work/earned-white-pass-ticket';
const hub='snezhnaya-hub',road='snezhnaya-field',cut='white-pass-cut';
const coach='white-pass-coach',station='white-pass-station',ticket='white-pass-ticket';
const saveKey='maple-lua-lab.checkpoint.v1';
const lua=JSON.parse(await fs.readFile(`${output}/lua.json`,'utf8'));
const start=JSON.parse(await fs.readFile(`${output}/ticket-start.json`,'utf8'));
const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1280,height:980}});
const drive=waypointDriver(page,Object.fromEntries(graph.nodes.map(n=>[n.id,n])),{walkTimeout:20000});
const game=page.locator('#game'), errors=[];
page.on('pageerror',error=>errors.push(error.message));
const frame=()=>page.evaluate(()=>window.lab.frame);

async function saveAndReload(destination){
 await page.locator('#saveProgress').click();
 await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('冒険を保存しました'));
 const save=await page.evaluate(key=>localStorage.getItem(key),saveKey);
 await page.reload();
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#loadProgress').click();
 await drive.waitNode(destination);
 return JSON.parse(save);
}

async function inspect(x,n){
 await drive.walk(x);
 await page.waitForFunction(()=>window.lab.frame.storyNearbyMilestone);
 await page.keyboard.press('KeyG');
 await drive.count(ticket,n);
}

async function captureFlurries(){
 return page.evaluate(async()=>{
  const {loadScenery,scenery,sceneryDefinitions}=await import('./scenery.js');
  const frame=window.lab.frame,canvas=document.createElement('canvas');
  canvas.width=960;canvas.height=540;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  const read=(time,file)=>{
   const view={...frame,voyage:{...frame.voyage,elapsed:time}};
   scenery(ctx,view,file);
   return ctx.getImageData(0,0,960,540).data;
  };
  const tier=sceneryDefinitions.whitePassCoach.decodedPreview;
  await Promise.all([loadScenery(frame),loadScenery(frame,tier)]);
  return [undefined,tier].map(file=>{
   const a=read(frame.voyage.elapsed,file),b=read(frame.voyage.elapsed+.75,file);
   const again=read(frame.voyage.elapsed,file);
   let moving=0,outside=0,repeated=0;
   for(let i=0;i<a.length;i+=4){
    const y=Math.floor(i/(4*canvas.width));
    if(a[i]!==again[i]||a[i+1]!==again[i+1]||a[i+2]!==again[i+2])repeated++;
    if(a[i]===b[i]&&a[i+1]===b[i+1]&&a[i+2]===b[i+2])continue;
    moving++;
    if(y<158||y>=251)outside++;
   }
   return {background:file?'decoded':'png',moving,outside,repeated};
  });
 });
}

try{
 await page.goto(process.env.LAB_URL??'http://127.0.0.1:8856/');
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#importSave').setInputFiles(`${output}/ticket-start.json`);
 await drive.waitNode(hub);
 assert.equal((await frame()).progression.level,141);
 await drive.accept(ticket);
 await drive.cross(road);
 await drive.cross(cut);
 await inspect(282,1);
 const partial=await saveAndReload(hub);
 assert.equal(partial.story.quests[ticket].count,1);
 await drive.count(ticket,1);
 await drive.cross(road);
 await drive.cross(cut);
 await drive.walk(465);
 await page.locator('#auto').click();
 await page.waitForFunction(ticket=>window.lab.frame.story.quests[ticket]?.count===2,ticket,{timeout:26000});
 await page.locator('#auto').click();
 await drive.walk(685);
 await drive.changeHeight(382);
 await inspect(685,3);
 await game.screenshot({path:`${output}/upper-sign.png`});
 await drive.cross(road);
 await drive.cross(hub);
 const before=await frame();
 await drive.report(ticket);
 const after=await frame();
 assert.deepEqual([after.progression.questXp-before.progression.questXp,after.mora-before.mora],lua.reward);

 await drive.walk(800);
 await page.waitForFunction(()=>window.lab.frame.storyNearbyPortal?.trainBoard);
 assert.equal(await page.locator('#nearbyPortalGo').textContent(),'F：列車に乗る');
 await drive.cross(coach);
 await page.waitForFunction(()=>window.lab.frame.voyage?.elapsed>=1);
 await page.locator('#pause').click();
 await page.waitForFunction(()=>window.lab.frame.paused);
 const paused=await frame();
 assert.equal(paused.voyage.total,9);
 const flurries=await captureFlurries();
 for(const result of flurries){
  assert.ok(result.moving>50,JSON.stringify(result));
  assert.equal(result.outside,0);
  assert.equal(result.repeated,0);
 }
 await game.screenshot({path:`${output}/coach-flurries.png`});
 assert.equal((await frame()).voyage.elapsed,paused.voyage.elapsed);
 await page.locator('#pause').click();
 await page.waitForFunction(()=>!window.lab.frame.paused);
 const inTransit=await saveAndReload(hub);
 assert.equal(inTransit.story.node,coach);
 assert.equal((await frame()).voyage,undefined);
 await drive.cross(coach);
 await drive.waitNode(station);
 await page.locator('[data-quest="white-pass-trail"][data-status="locked"]').getByText(/Lv148/).first().waitFor();
 const finished=await saveAndReload(station);
 assert.equal(finished.progression.level,142);
 const prior=Object.entries(start.story.quests).filter(([,q])=>q.status==='complete');
 for(const [id,q] of prior)assert.deepEqual(finished.story.quests[id],q,id);
 const retained=new Set(finished.inventory.items.map(item=>item.id));
 for(const item of start.inventory.items)assert.ok(retained.has(item.id),item.id);
 assert.equal(finished.companion,start.companion);
 assert.deepEqual(errors,[]);
 await fs.writeFile(`${output}/complete.json`,JSON.stringify(finished)+'\n');
 const proof={levels:[141,finished.progression.level],observatoryRestored:true,routeCartStopped:true,
  upperSignY:382,trainSeconds:9,pausedTrain:true,flurries,midRideResume:hub,restoredAt:station,
  nextChapterLevel:148,priorQuests:prior.length,inventoryKept:start.inventory.items.length,
  companion:finished.companion,errors};
 await fs.writeFile(`${output}/browser.json`,JSON.stringify(proof,null,2)+'\n');
 console.log(proof);
}catch(error){
 console.error(await page.evaluate(()=>({node:window.lab?.frame?.story?.node,voyage:window.lab?.frame?.voyage,
  quest:window.lab?.frame?.story?.quests['white-pass-ticket'],actor:window.lab?.frame?.actors[0]})),errors);
 throw error;
}finally{await browser.close()}
