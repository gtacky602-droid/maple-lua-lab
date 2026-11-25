import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver,holdPortalFrame} from './tools/browser_waypoint_test.mjs';

const {nodes}=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1250,height:900}});
const drive=waypointDriver(page,Object.fromEntries(nodes.map(n=>[n.id,n])));
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
function markerPixel(){
 const f=window.lab.frame,t=f.storyHunts?.['mond-patrol'];
 if(!t?.spawn)return '';
 const ctx=document.querySelector('#game').getContext('2d');
 const x=Math.round(t.x-f.camera)-8,y=Math.round(t.y)+2;
 return Array.from(ctx.getImageData(x,y,1,1).data).join(',');
}
const mint='129,255,224,255';
try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:9117/');
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#importSave').setInputFiles('work/earned-mond-hunts.json');
 await drive.waitNode('mond-town');
 await page.locator('[data-quest="mond-patrol"]').getByRole('button',{name:'この依頼を追跡'}).click();
 const release=await holdPortalFrame(page);
 await drive.cross('mond-road');
 await page.waitForFunction(()=>document.querySelector('#trackedHuntHint').textContent.includes('討伐対象'));
 const samples=[];
 for(const [mode,tier] of [['sprite','0'],['rect','4096'],['h48c32','4096'],['h32c16','4096']]){
  const response=page.waitForResponse(r=>r.url().endsWith('/api/frame')&&r.request().postDataJSON()?.profile===mode);
  await page.selectOption('#renderMode',mode);
  await page.selectOption('#playBackgroundTier',tier);
  const reply=await response;
  assert.ok(reply.ok());
  await reply.finished();
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  if(tier==='4096')await page.waitForFunction(()=>document.querySelector('#playBackgroundStatus').textContent==='');
  await page.waitForFunction(markerPixel);
  await page.waitForFunction(()=>window.lab.records.length>=1);
  assert.equal(await page.evaluate(markerPixel),mint,mode);
  samples.push({mode,tier,hint:await page.locator('#trackedHuntHint').innerText(),pixel:mint,
   canvasCalls:await page.evaluate(()=>window.lab.records.at(-1).calls)});
  if(mode==='sprite'||mode==='h32c16')await page.locator('#game').screenshot({path:'evidence/earned-hunt-'+mode+'.png'});
 }
 await page.getByRole('button',{name:'追跡を解除',exact:true}).first().click();
 await page.waitForFunction(()=>!document.querySelector('#trackedHuntHint').dataset.quest);
 await page.waitForFunction(()=>{const f=window.lab.frame,t=f.storyHunts['mond-patrol'];return document.querySelector('#game').getContext('2d').getImageData(Math.round(t.x-f.camera)-8,Math.round(t.y)+2,1,1).data[0]!==129});
 assert.deepEqual(errors,[]);
 await release();
 await fs.writeFile('evidence/earned-hunts-browser.json',JSON.stringify({samples,errors},null,2)+'\n');
 console.log('Four render modes showed the tracked target. Clearing tracking removed the brackets.');
}finally{await browser.close()}
