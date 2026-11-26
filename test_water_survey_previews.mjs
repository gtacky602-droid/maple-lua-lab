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
  const stageCount=stops.length+1+Number(Boolean(node.waterSurvey.reportLight));
  assert.equal(await stage.locator('option').count(),stageCount);
  for(let count=0;count<stageCount;count++){
   await stage.selectOption(String(count));
   for(const [index,step] of stops.entries()){
    const art=graph.waterInstruments[step.waterInstrument];
    const checkedRows=[art[index<count?'after':'before'][0]];
    if(art.pending)checkedRows.push((count>stops.length?art.reported:art.pending)[0]);
    for(const [dx,dy,,,color] of checkedRows){
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
   await page.locator('#sceneryDetail').evaluate(el=>el.open=true);
   await page.waitForFunction(n=>new URL(document.querySelector('#detailLink').href).searchParams.get('stage')===String(n),count+1);
   const link=await page.locator('#detailLink').getAttribute('href');
   await page.goto(new URL(link,page.url()).href);
   await page.waitForFunction(()=>window.mapArt?.ready);
   assert.equal(await stage.inputValue(),String(count));
  }
  console.log(node.id,stageCount,'stages and shared links verified');
 }
}finally{await browser.close()}
