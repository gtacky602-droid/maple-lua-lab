import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';

const {quests}=JSON.parse(await readFile('content/story-graph.json','utf8'));
const base=process.env.LAB_URL||'http://127.0.0.1:9125/';
const browser=await chromium.launch({channel:'chrome',args:['--disable-accelerated-2d-canvas']});
try{
 const page=await browser.newPage();
 let count=0;
 for(const q of quests){
  for(const [i,s] of (q.itinerary??[]).entries()){
   if(s.kind!=='choice'||!s.node.startsWith('nod-'))continue;
   for(const [j,o] of s.choices.entries()){
    const query=new URLSearchParams({placements:'live',node:s.node,quest:q.id,step:i+1,choice:j+1,background:'original'});
    await page.goto(new URL('map-art.html?'+query,base).href);
    await page.waitForFunction(()=>window.mapArt?.ready&&mapArt.backgroundState==='ready');
    assert((await page.locator('#surveyPointNote').innerText()).includes(o.name));
    const samples=await page.evaluate(({o,chest})=>['png','rect'].map(id=>{
     const ctx=document.getElementById(id).getContext('2d');
     const pixel=(x,y)=>Array.from(ctx.getImageData(x-mapArt.camera,y,1,1).data).slice(0,3);
     return {base:pixel(o.x-6,o.y-(o.detourGift?24:18)),lock:chest&&pixel(chest.x,chest.y-16),
      gift:Array.from(ctx.getImageData(o.x-mapArt.camera-12,o.y-50,24,20).data).join(',')};
    }),{o,chest:s.treasure});
    for(const sample of samples){
     assert.deepEqual(sample.base,o.detourGift?[169,130,96]:[211,219,245],o.name);
     if(s.treasure)assert.deepEqual(sample.lock,[238,211,154]);
    }
    if(o.detourGift)assert.notEqual(samples[0].gift,samples[1].gift,o.name);
    if(o.id==='chime')await page.locator('#rect').screenshot({path:'evidence/nod-night-stall-choices-16.png'});
    count++;
   }
  }
 }
 assert.equal(count,11);
 console.log('11 Nod-Krai choices checked in both profiles.');
}finally{await browser.close()}
