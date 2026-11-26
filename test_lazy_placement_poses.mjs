import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const weekly=JSON.parse(await fs.readFile('content/weekly-boss-spawns.json','utf8')).weeklyBosses;
const mechanisms=JSON.parse(await fs.readFile('content/weekly-opening-parts.json','utf8'));
const index=JSON.parse(await fs.readFile('assets/placement-pose-index.json','utf8'));
const pages=new Map(weekly.filter(b=>b.openingPose).map(b=>[b.node,[b.openingPose.file]]));
for(const [id,scene] of Object.entries(mechanisms))pages.set(id,scene.parts.map(p=>p.file).filter(Boolean));
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage();
 const errors=[],requests=[];
 page.on('pageerror',error=>errors.push(error.message));
 page.on('request',request=>requests.push(new URL(request.url()).pathname));
 await page.goto(new URL('/map-art.html?node=mond-road&placements=live',process.env.LAB_URL).href);
 const ready=id=>page.waitForFunction(id=>window.mapArt?.ready&&window.mapArt.node===id,id);
 await ready('mond-road');
 assert(!requests.some(path=>path.includes('gallery-packed.json')||path.includes('/weekly-packed/')));
 const [first,firstFiles]=pages.entries().next().value;
 const firstPath='/assets/'+index['weekly/'+firstFiles[0]].poseFile;
 await page.route('**'+firstPath,route=>route.fulfill({status:503,body:'retry'}),{times:1});
 await page.selectOption('#node',first);
 await page.getByRole('button',{name:'もう一度読み込む'}).click();
 await ready(first);
 assert.equal(requests.filter(path=>path===firstPath).length,2);
 requests.splice(requests.indexOf(firstPath),1);
 for(const [node,files] of pages){
  await page.selectOption('#node',node);
  await ready(node);
  for(const file of files)assert(requests.includes('/assets/'+index['weekly/'+file].poseFile),node+' / '+file);
 }
 const files=requests.filter(p=>p.includes('/weekly-packed/'));
 await page.selectOption('#node',first);
 await ready(first);
 assert.deepEqual(requests.filter(p=>p.includes('/weekly-packed/')),files);
 assert.equal(files.length,new Set(files).size);
 assert.deepEqual(errors,[]);
 console.log(pages.size+' weekly arena previews loaded the expected poses; revisiting reused them');
}finally{await browser.close()}
