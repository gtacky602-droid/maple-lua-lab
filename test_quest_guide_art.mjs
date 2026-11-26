import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {surveyPoint,surveyPointUrl} from './survey-point.js';
import {rectangleCount,spriteBounds} from './sprite-layers.js';

const graph=JSON.parse(await readFile('content/story-graph.json','utf8'));
const browser=await chromium.launch({channel:'chrome',args:['--disable-accelerated-2d-canvas']});
try{
 const page=await browser.newPage();
 for(const quest of graph.quests){
  for(const [index,step] of (quest.itinerary??[]).entries()){
   if(!quest.surveyAssist&&!step.surveyGuide&&!['flower','dry','wood'].includes(step.scentProp))continue;
   const point=surveyPoint(quest,index,step.node);
   const props=point.props;
   if(step.surveyGuide)assert(props.some(p=>p.name==='放浪者'&&p.x===step.surveyGuide.x&&p.y===step.surveyGuide.y));
   if(quest.surveyAssist){
    const marks=quest.itinerary.slice(0,index+1).filter(m=>m.node===step.node&&m.surveyProp);
    for(const m of marks)assert(props.some(p=>p.x===m.x&&p.y===m.y&&p.name===m.name));
    if(step.node===quest.target){
     assert.equal(props.filter(p=>p.name==='キノコン').length,index===quest.goal-1?0:2);
     if(index===quest.goal-1)assert(props.some(p=>p.file.includes('leverOn')));
    }
   }
   const poses=await Promise.all(props.map(async p=>JSON.parse(await readFile('assets/'+p.file,'utf8'))));
   await page.goto(new URL(surveyPointUrl(point),process.env.LAB_URL||'http://127.0.0.1:9125/').href);
   await page.waitForFunction(()=>window.mapArt?.ready&&mapArt.backgroundState==='ready');
   await page.locator('#compareSpriteProfiles').click();
   const camera=await page.evaluate(()=>mapArt.camera);
   const visible=poses.filter((pose,j)=>{
    const box=spriteBounds(pose,props[j].height),left=props[j].x-camera+box.x;
    return left<961&&left+box.width>-1;
   });
   if(quest.surveyAssist&&step.node===quest.target){
    for(const id of ['png','rect']){
     const pixel=await page.locator('#'+id).evaluate((canvas,x)=>
      Array.from(canvas.getContext('2d').getImageData(x,392,1,1).data).slice(0,3).join(','),700-camera);
     assert.equal(pixel==='166,169,116',index===quest.goal-1,step.name);
    }
   }
   const rows=page.locator('#spriteProfileTable tbody tr');
   for(const [i,profile] of ['legacy','h48c32','h32c16'].entries()){
    const cells=await rows.nth(i).locator('td').allTextContents();
    assert.equal(Number(cells[1].replaceAll(',','')),visible.reduce((n,pose)=>n+rectangleCount(pose.profiles[profile]),0),step.name);
    assert(parseFloat(cells[2])>0,step.name);
    if(i===2)console.log(step.node,step.name,cells.slice(1).join(' / '));
   }
  }
 }
}finally{await browser.close()}
