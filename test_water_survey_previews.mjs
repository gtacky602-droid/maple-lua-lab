import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const browser=await chromium.launch({channel:'chrome'});
try{
 const page=await browser.newPage();
 for(const node of graph.nodes.filter(n=>n.waterSurvey)){
  const quest=graph.quests.find(q=>q.id===node.waterSurvey.quest);
  const stops=node.waterSurvey.steps.map(index=>quest.itinerary[index-1]);
  const query=new URLSearchParams({node:node.id,placements:'live'});
  await page.goto(new URL('map-art.html?'+query,process.env.LAB_URL||'http://127.0.0.1:9125').href);
  await page.waitForFunction(()=>window.mapArt?.ready);
  const stage=page.locator('#questPropStage');
  assert.equal(await stage.locator('option').count(),stops.length+1);
  for(let count=0;count<=stops.length;count++){
   await stage.selectOption(String(count));
   for(const [index,step] of stops.entries()){
    const art=graph.waterInstruments[step.waterInstrument];
    const [dx,dy,,,color]=art[index<count?'after':'before'][0];
    for(const canvas of ['png','rect']){
     const rgb=await page.evaluate(({canvas,x,y})=>{
      const px=x-window.mapArt.camera;
      if(px<0||px>=960)return null;
      return Array.from(document.getElementById(canvas).getContext('2d').getImageData(px,y,1,1).data).slice(0,3);
     },{canvas,x:step.x+dx+1,y:step.y+dy+1});
     if(!rgb){assert.notEqual(step,stops[Math.max(0,count-1)]);continue}
     assert.equal('#'+rgb.map(v=>v.toString(16).padStart(2,'0')).join(''),color);
    }
   }
  }
  console.log(node.id,stops.length+1,'stages verified');
 }
}finally{await browser.close()}
