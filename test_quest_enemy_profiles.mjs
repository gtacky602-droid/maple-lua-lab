import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';

const graph=JSON.parse(await readFile('content/story-graph.json','utf8'));
const targets=new Map();
for(const q of graph.quests){
 for(const steps of [q.itinerary,...(q.paths??[]).map(p=>p.steps)]){
  for(const step of steps??[]){
   if(step.kind!=='kill')continue;
   for(const subject of step.enemies??[step.enemy]){
    targets.set(step.node+'/'+subject,{node:step.node,subject});
   }
  }
 }
}

const browser=await chromium.launch({channel:'chrome',args:['--disable-accelerated-2d-canvas']});
try{
 const page=await browser.newPage(),results=[];
 for(const target of targets.values()){
  const url=new URL('map-art.html',process.env.LAB_URL??'http://127.0.0.1:9125/');
  url.search=new URLSearchParams({...target,placements:'live'});
  await page.goto(url.href);
  await page.waitForFunction(t=>window.mapArt?.node===t.node && window.mapArt.ready &&
   document.querySelector('#liveSubject').value===t.subject,target);
  await page.locator('#compareSpriteProfiles').click();
  const profiles=await page.locator('#spriteProfileTable tbody tr').evaluateAll(rows=>
   Object.fromEntries(rows.map(row=>{
    const [,count,shape,rgb]=[...row.cells].map(c=>c.textContent);
    return [row.querySelector('button').value,{rectangles:Number(count.replaceAll(',','')),
     overlapPercent:parseFloat(shape),meanRgbError:parseFloat(rgb)}];
   })));
  for(const profile of Object.values(profiles)){
   assert(profile.rectangles>0 && profile.overlapPercent>0 && Number.isFinite(profile.meanRgbError),target.subject);
  }
  results.push({...target,camera:await page.evaluate(()=>window.mapArt.camera),profiles});
 }
 results.sort((a,b)=>a.profiles.h32c16.overlapPercent-b.profiles.h32c16.overlapPercent);
 await writeFile('evidence/quest-enemy-profile-scores.json',JSON.stringify(results,null,2)+'\n');
 console.log(results.length,'placements; lowest 16-color overlap:',results[0]);
}finally{await browser.close()}
