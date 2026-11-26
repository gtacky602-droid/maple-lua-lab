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
    if(o.id==='chime'){
     await page.locator('#compareSpriteProfiles').click();
     const rows=page.locator('#spriteProfileTable tbody tr');
     const art=await Promise.all(s.choices.map(async item=>JSON.parse(await readFile(
      'assets/quest-packed/coastal-gifts-'+item.id+'-sprites-v1.json','utf8'))));
     for(const [index,key] of ['legacy','h48c32','h32c16'].entries()){
      const expected=art.reduce((sum,item)=>{
       const grid=item.profiles[key];
       return sum+Buffer.from(grid.data,'base64').length/(grid.wide?9:5);
      },0);
      const cells=await rows.nth(index).locator('td').allTextContents();
      assert.equal(Number(cells[1].replaceAll(',','')),expected);
      assert(parseFloat(cells[2])>0&&parseFloat(cells[2])<=100);
      console.log(cells.join(' / '));
     }
     await rows.last().getByRole('button').click();
     await page.locator('#measureSprite').click();
     const measured=JSON.parse(await page.locator('#spriteFidelity').getAttribute('data-result'));
     assert.equal(measured.overlapPercent.toFixed(1)+'%',await rows.last().locator('td').nth(2).textContent());
     await page.locator('#spriteProfileTable').screenshot({path:'evidence/nod-night-stall-profile-table.png'});
     await page.locator('#rect').screenshot({path:'evidence/nod-night-stall-choices-16.png'});
    }
    count++;
   }
  }
 }
 assert.equal(count,11);
 console.log('11 Nod-Krai choices checked in both profiles.');
}finally{await browser.close()}
