import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const scenes=JSON.parse(await fs.readFile('content/field-boss-openings.json','utf8'));
const poses=new Map();
for(const [node,scene] of Object.entries(scenes)){
 for(const part of scene.parts)if(part.file)poses.set(part.file,node);
}
const base=process.env.LAB_URL||'http://127.0.0.1:9117/';
const browser=await chromium.launch({channel:'chrome'});
try{
 const page=await browser.newPage();
 const requests=[],errors=[];
 page.on('request',r=>{
  const file=new URL(r.url()).pathname.split('/').pop();
  if(poses.has(file))requests.push(file);
 });
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(new URL('map-art.html?node=asimon-field-ruins&placements=live',base).href);
 await page.waitForFunction(()=>window.mapArt?.ready);
 assert.deepEqual(requests,[]);
 const sizes={};
 for(const [file,node] of poses){
  await page.selectOption('#node',node);
  await page.waitForFunction(id=>window.mapArt?.node===id&&window.mapArt.ready,node);
  assert.equal(requests.filter(r=>r===file).length,1,file);
  sizes[file]=(await fs.stat('assets/'+file)).size;
 }
 for(const node of poses.values()){
  await page.selectOption('#node',node);
  await page.waitForFunction(id=>window.mapArt?.node===id&&window.mapArt.ready,node);
 }
 assert.deepEqual(requests.toSorted(),[...poses.keys()].sort());
 const firstVisits=requests.length;
 const savedNode='wenut-field-cavern',part=scenes[savedNode].parts[0];
 await page.goto(new URL('map-art.html?node='+savedNode,base).href);
 await page.waitForFunction(()=>window.mapArt?.ready);
 await page.locator('#loadLive').click();
 await page.waitForFunction(id=>window.mapArt?.ready&&window.mapArt.placements.some(p=>p.id===id),part.id);
 const original=await page.evaluate(()=>window.mapArt.visuals[0]);
 await page.locator('#saveBrowser').click();
 await page.reload();
 await page.waitForFunction(id=>window.mapArt?.ready&&window.mapArt.placements.some(p=>p.id===id),part.id);
 assert.deepEqual(await page.evaluate(()=>window.mapArt.visuals[0]),original);
 assert.deepEqual(errors,[]);
 const report={initialPoseJsonRequests:0,firstVisits,repeatVisitRequests:0,savedDraftPose:original.source,
  poseJsonBytesOnDisk:Object.values(sizes).reduce((a,b)=>a+b,0),files:sizes};
 await fs.writeFile('evidence/field-pose-loading.json',JSON.stringify(report,null,2)+'\n');
 console.log(report.firstVisits+' encounter pose files loaded on demand, '+report.poseJsonBytesOnDisk+' B on disk');
}finally{await browser.close()}
