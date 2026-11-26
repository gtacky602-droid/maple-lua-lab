import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const courts=[
 ['dobharcu-legend-garden','blubberbeast',1],['fading-veteran-legend-wreck','blubberbeast',1],
 ['fairy-knight-twins-legend-court','hunters-ray',2],['swords-of-the-gorge-legend-rift','hunters-ray',2],
 ['iron-viscount-legend-pool','sternshield-crab',1],['ocean-judge-legend-pool','sternshield-crab',1]
];
const browser=await chromium.launch({channel:'chrome'});
try{
 const page=await browser.newPage({viewport:{width:1280,height:900}});
 for(const [node,species,count] of courts){
  const url=new URL('map-art.html',process.env.LAB_URL||'http://127.0.0.1:9125/');
  url.search=new URLSearchParams({node,placements:'live',idle:'candidate',sharedProfiles:'all'});
  url.hash='sharedLegendArt';await page.goto(url.href);
  const panel=page.locator('#sharedLegendArt'),views=panel.locator('.shared-profile-views');
  await views.nth(count-1).locator('canvas').nth(2).waitFor();
  assert.equal(await views.count(),count);
  assert(await page.locator('#candidateIdle').isChecked());
  const links=await panel.locator('a').evaluateAll(as=>as.map(a=>new URL(a.href).searchParams.get('q')));
  assert.deepEqual(links,Array(count).fill(species));
  const snapshots=async()=>{await page.waitForFunction(()=>window.mapArt?.visuals?.length);return page.evaluate(()=>window.mapArt.visuals.map(v=>[v.height,v.y,v.source]))};
  const candidate=await snapshots();
  for(const view of await views.all()){
   const rendered=await view.locator('canvas').evaluateAll(cs=>cs.map(c=>{
    const ctx=c.getContext('2d'),w=c.width/2;
    return [0,w].every(x=>ctx.getImageData(x,0,w,c.height).data.some((v,i)=>i%4===0&&v!==32));
   }));
   assert.deepEqual(rendered,[true,true,true]);
  }
  if(species==='hunters-ray'&&count===2&&node.startsWith('fairy'))await views.first().screenshot({path:'evidence/fairy-knight-swimmer-profiles.png'});
  await page.uncheck('#candidateIdle');
  const original=await snapshots();
  assert.equal(candidate.length,count);
  for(let i=0;i<count;i++){
   assert.deepEqual(candidate[i].slice(0,2),original[i].slice(0,2));
   assert.notEqual(candidate[i][2],original[i][2]);
  }
 }
 console.log('Verified 8 bodies in 6 underwater arenas across 3 profiles and restored their original opening poses.');
}finally{await browser.close()}
