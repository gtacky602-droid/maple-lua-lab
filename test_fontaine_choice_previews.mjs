import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';

const {quests,nodes}=JSON.parse(await readFile('content/story-graph.json','utf8'));
const base=process.env.LAB_URL||'http://127.0.0.1:9125/';
const browser=await chromium.launch({channel:'chrome',args:['--disable-accelerated-2d-canvas']});
try{
 const page=await browser.newPage();
 let count=0;
 for(const quest of quests.filter(q=>q.id.startsWith('fon-'))){
  const index=quest.itinerary?.findIndex(s=>s.kind==='choice')??-1;
  if(index<0)continue;
  const step=quest.itinerary[index],node=nodes.find(n=>n.id===step.node);
  for(const [i,o] of step.choices.entries()){
   const camera=Math.max(0,Math.min(node.width-960,o.x-480));
   const query=new URLSearchParams({placements:'live',node:node.id,camera,background:'original'});
   const open=async()=>{
    await page.goto(new URL('map-art.html?'+query,base).href);
    await page.waitForFunction(x=>window.mapArt?.ready&&mapArt.camera===x&&mapArt.backgroundState==='ready',camera);
   };
   const pixels=()=>page.evaluate(({x,y})=>['png','rect'].map(id=>Array.from(document.getElementById(id).getContext('2d')
    .getImageData(x-mapArt.camera-12,y-32,24,18).data).join(',')),o);
   await open();const empty=await pixels();
   query.set('quest',quest.id);query.set('step',index+1);query.set('choice',i+1);
   await open();
   assert((await page.locator('#surveyPointNote').innerText()).includes(o.name));
   const drawn=await pixels();
   for(let k=0;k<2;k++)assert.notEqual(drawn[k],empty[k],quest.id+'/'+o.id);
   assert.notEqual(drawn[0],drawn[1],o.id);
   if(o.id==='bubbles')await page.locator('#rect').screenshot({path:'evidence/freminet-choice-field-16.png'});
   count++;
  }
 }
 assert.equal(count,8);
 console.log('All eight Fontaine choices visible above their cursor in PNG and 16 colors.');
}finally{await browser.close()}
