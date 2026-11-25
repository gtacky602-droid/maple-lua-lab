import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1240,height:940}});
const {nodes}=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const drive=waypointDriver(page,Object.fromEntries(nodes.map(n=>[n.id,n])));
const id='fontaine-moon-parcel', errors=[];
page.on('pageerror',error=>errors.push(error.message));
async function collect(x,count){
 await drive.walk(x);
 await page.waitForFunction(()=>window.lab.frame.storyNearbyMilestone);
 await page.keyboard.press('KeyG');
 await drive.count(id,count);
}
async function phase(value){
 await page.waitForFunction(v=>window.lab.frame.storyTheaterCart?.phase===v,value);
}
try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:9117/');
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#importSave').setInputFiles('work/sumeru-fresh-route/fontaine-save.json');
 await drive.waitNode('fontaine-hub');
 await drive.accept(id);
 await page.locator('[data-quest="'+id+'"]').getByRole('button',{name:'この依頼を追跡'}).click();
 await drive.cross('fontaine-parcel-counter');
 await collect(320,1);
 await drive.cross('fontaine-delivery-quay');
 await collect(508,2);
 await collect(900,3);
 await drive.walk(1038);
 for(const label of ['水路に沈んだ','今の倉庫へ運んだ','旧搬入口へ運んだ']){
  await page.keyboard.press('KeyG');
  await page.waitForFunction(s=>window.lab.frame.storyAirflow?.selection===s,label);
 }
 await page.locator('#airflowCommit').click();
 await drive.count(id,4);
 await drive.walk(1178);
 await page.waitForFunction(()=>document.querySelector('#trackedHuntHint').textContent.includes('ベルを鳴らす'));
 await page.keyboard.press('KeyG');
 await phase('waitingForPlayer');
 await page.waitForFunction(()=>document.querySelector('#trackedHuntHint').textContent.includes('合流'));
 await page.keyboard.press('KeyP');
 await page.waitForFunction(()=>window.lab.frame.paused);
 const samples=[];
 await page.selectOption('#playBackgroundTier','4096');
 for(const mode of ['sprite','rect','h48c32','h32c16']){
  const rendered=page.waitForResponse(r=>r.url().endsWith('/api/frame')&&r.request().postDataJSON()?.profile===mode);
  await page.selectOption('#renderMode',mode);
  await (await rendered).finished();
  await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
  await page.waitForFunction(()=>document.querySelector('#playBackgroundStatus').textContent==='');
  const sample=await page.evaluate(id=>{
   const f=window.lab.frame,mark=f.storyHunts[id],cart=f.storyTheaterCart;
   const x=Math.round(mark.x-f.camera)-8,y=Math.round(mark.y)+2;
   return {tick:f.t,cart:cart.x,mark:mark.x,calls:window.lab.records.at(-1).calls,
    pixel:Array.from(document.querySelector('#game').getContext('2d').getImageData(x,y,1,1).data)};
  },id);
  assert.equal(sample.cart,sample.mark);
  assert.deepEqual(sample.pixel,[255,224,129,255]);
  samples.push({mode,...sample});
  if(mode==='h32c16'||mode==='sprite')await page.locator('#game').screenshot({path:'evidence/parcel-escort-guide-'+mode+'.png'});
 }
 assert.equal(new Set(samples.map(s=>s.tick)).size,1);
 assert.ok(samples[1].calls>samples[2].calls&&samples[2].calls>samples[3].calls);
 await page.locator('#pause').click();
 await drive.walk(1450);
 await phase('following');
 await drive.walk(1650);
 await drive.count(id,5);
 await phase('parked');
 await page.waitForFunction(()=>document.querySelector('#trackedHuntHint').hidden);
 await drive.cross('fontaine-old-scenery-door');
 await page.waitForFunction(()=>document.querySelector('#trackedHuntHint').textContent.includes('討伐対象'));
 await page.goto(new URL('compare.html#escort-comparison',page.url()).href);
 const split=page.locator('#escortSplit'), wipe=page.locator('.escort-wipe');
 await wipe.scrollIntoViewIfNeeded();
 await page.waitForFunction(()=>[...document.querySelectorAll('.escort-wipe img')].every(img=>img.complete&&img.naturalWidth>0));
 await page.waitForFunction(()=>typeof document.querySelector('#escortSplit').oninput==='function');
 await split.focus();
 await split.press('Home');
 await page.waitForFunction(()=>document.querySelector('.escort-wipe').style.getPropertyValue('--split')==='0%');
 const light=await wipe.screenshot();
 await split.press('End');
 await page.waitForFunction(()=>document.querySelector('.escort-wipe').style.getPropertyValue('--split')==='100%');
 const source=await wipe.screenshot();
 assert.ok(!light.equals(source));
 await page.setViewportSize({width:390,height:844});
 await split.press('Home');
 await split.press('ArrowRight');
 assert.equal(await split.getAttribute('aria-valuetext'),'1パーセント');
 assert.ok((await wipe.boundingBox()).width<=390);
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/parcel-escort-guide-browser.json',JSON.stringify({source:'earned Lv80',samples,errors},null,2)+'\n');
 console.log('Earned escort: bell, separation, four render profiles, reunion, open shutter and next guards.');
}finally{await browser.close()}
