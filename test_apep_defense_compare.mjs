import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const browser=await chromium.launch({channel:'chrome',args:['--disable-accelerated-2d-canvas']});
try{
 const page=await browser.newPage({viewport:{width:1400,height:960}});
 const base=process.env.LAB_URL || 'http://127.0.0.1:9117/';
 await page.goto(base+'map-art.html?node=apep-oasis-heart-arena&placements=live');
 const [view]=await Promise.all([page.waitForEvent('popup'),page.locator('#defenseCompareLink').click()]);
 await view.waitForFunction(()=>window.compareLab?.frame.weeklyBoss?.apep.units?.length===4);
 const read=()=>view.evaluate(()=>{
  const {frame,frozen}=window.compareLab;
  return {node:frame.story.node,stage:frame.weeklyBoss.apepStage,t:frame.t,progress:frame.weeklyBoss.apep.progress,
   units:frame.weeklyBoss.apep.units.map(u=>[u.id,u.role,u.x]),frozen,
   profiles:frame.comparisons.map(c=>[c.profile,c.t,c.commands]),
   meters:frame.comparisons.map(c=>c.draws.find(d=>d.color==='#f3df8e'))};
 });
 const start=await read();
 assert.deepEqual([start.node,start.stage,start.frozen],['apep-oasis-heart-arena','defense',true]);
 assert.deepEqual(start.profiles.map(r=>r.slice(0,2)),[['png',start.t],['h32c16',start.t]]);
 assert.deepEqual(start.meters[0],start.meters[1]);
 assert.equal(start.meters[0].x,453);
 assert.ok(start.units.some(u=>u[2]<480) && start.units.some(u=>u[2]>480));
 await view.evaluate(async()=>{const {loadScenery}=await import('./scenery.js');await loadScenery(window.compareLab.frame)});
 await view.waitForFunction(()=>window.compareLab.samples.length>=3);
 const images=()=>view.evaluate(()=>['sceneA','sceneB'].map(id=>document.getElementById(id).toDataURL()));
 const original=await images();assert.notEqual(original[0],original[1]);
 const sideLabels=['元PNG','16色の矩形描画'];
 const comparison=await view.evaluate(labels=>{
  const out=document.createElement('canvas');out.width=1152;out.height=358;
  const ctx=out.getContext('2d');ctx.fillStyle='#1c252c';ctx.fillRect(0,0,1152,358);
  ctx.imageSmoothingEnabled=false;ctx.font='18px "Yu Gothic UI"';ctx.fillStyle='#fff2db';
  for(const [i,id] of ['sceneA','sceneB'].entries()){
   ctx.fillText(labels[i],i*576+10,24);
   ctx.drawImage(document.getElementById(id),i*576,34,576,324);
  }
  return out.toDataURL().split(',')[1];
 },sideLabels);
 await fs.writeFile('evidence/apep-heart-defense-comparison.png',Buffer.from(comparison,'base64'));
 await view.selectOption('#right','png');
 await view.waitForFunction(()=>window.compareLab?.profiles[1]==='png');
 const same=await images();assert.equal(same[0],same[1]);
 assert.equal((await read()).t,start.t);
 await view.selectOption('#right','h32c16');
 await view.waitForFunction(()=>window.compareLab?.profiles[1]==='h32c16');
 await view.locator('#freeze').click();
 await view.waitForFunction(t=>window.compareLab.frame.t>t+.4,start.t);
 await view.locator('#freeze').click();
 await view.waitForFunction(()=>window.compareLab.frozen && window.compareLab.requestedSteps===0);
 const moving=await read();assert.notDeepEqual(moving.units,start.units);
 await view.locator('#apepDefenseCompare').click();
 await view.waitForFunction(t=>window.compareLab.frame.t===t && window.compareLab.frozen,start.t);
 const again=await read();assert.deepEqual(again.units,start.units);
 await fs.writeFile('evidence/apep-defense-compare-browser.json',JSON.stringify({start,afterRunning:moving,restartedAt:again.t,
  matchingPngCanvases:true},null,2)+'\n');
 console.log('Apep defense: M-map link, identical PNG canvases, synchronized 16 colors, motion and restart passed.');
}finally{await browser.close()}
