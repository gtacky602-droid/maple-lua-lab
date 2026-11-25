import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver,holdPortalFrame} from './tools/browser_waypoint_test.mjs';

const {nodes}=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1240,height:950}});
const drive=waypointDriver(page,Object.fromEntries(nodes.map(n=>[n.id,n])));
const quest='liyue-market-delivery', hub='liyue-harbor', yard='liyue-loading-yard';
const errors=[], checks=[];
page.on('pageerror',e=>errors.push(e.message));

async function load(file){
 await page.locator('#importSave').setInputFiles('work/liyue-fresh-route/'+file+'.json');
 await drive.waitNode(hub);
}
async function marker(label,color){
 await page.waitForFunction(({quest,label,color})=>{
  const hint=document.querySelector('#trackedHuntHint');
  if(!hint.textContent.includes(label)||hint.hidden)return false;
  const f=window.lab.frame,t=f.storyHunts?.[quest];
  if(!t)return false;
  const ctx=document.querySelector('#game').getContext('2d');
  const x=Math.round(t.x-f.camera)-8,y=Math.round(t.y)+2;
  return Array.from(ctx.getImageData(x,y,1,1).data).join(',')===color;
 },{quest,label,color});
 checks.push({label,color,observed:await page.locator('#trackedHuntHint').innerText()});
}
try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:9117/');
 await page.waitForFunction(()=>window.lab?.frame);
 await load('earned-delivery-start');
 await page.locator('[data-quest="'+quest+'"]').getByRole('button',{name:'この依頼を追跡'}).click();
 await page.selectOption('#renderMode','h32c16');
 await page.selectOption('#playBackgroundTier','4096');
 const release=await holdPortalFrame(page);
 await drive.cross(yard);
 await marker('討伐対象','129,255,224,255');
 assert.equal(await page.locator('#trackedQuestMap').getAttribute('data-node'),yard);
 await release();
 await load('earned-wheel-recovery');
 await drive.cross(yard);
 await marker('車輪の荷箱','255,224,129,255');
 await drive.walk(620);
 await page.locator('#game').screenshot({path:'evidence/liyue-wheel-guide-light.png'});
 await drive.walk(735);
 await drive.changeHeight(380);
 await page.waitForFunction(()=>window.lab.frame.storyNearbyParcel?.name==='車輪の荷箱');
 await page.keyboard.press('KeyG');
 await page.waitForFunction(id=>window.lab.frame.story.quests[id].delivery.recovered,quest);
 await page.waitForFunction(()=>document.querySelector('#trackedHuntHint').hidden);
 await drive.cross(hub);
 await drive.walk(1050);
 await marker('荷車の修理屋','255,224,129,255');
 await page.locator('#storyDeliveryOptions').getByRole('button',{name:'荷札「車輪」を渡す'}).click();
 await drive.count(quest,3);
 await page.waitForFunction(()=>document.querySelector('#trackedHuntHint').hidden);
 await drive.report(quest);
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/cargo-guide-browser.json',JSON.stringify({quest,mode:'h32c16',background:4096,checks,errors},null,2)+'\n');
 console.log('Light mode: guard, recovered wheel, repair stall, handover and report passed.');
}finally{await browser.close()}
