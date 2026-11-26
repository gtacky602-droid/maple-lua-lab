import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {surveyPoint,surveyPointUrl} from './survey-point.js';
import {rectangleCount} from './sprite-layers.js';

const graph=JSON.parse(await readFile('content/story-graph.json','utf8'));
const browser=await chromium.launch({channel:'chrome',args:['--disable-accelerated-2d-canvas']});
try{
 const page=await browser.newPage();
 for(const quest of graph.quests){
  for(const [index,step] of (quest.itinerary??[]).entries()){
   if(!step.surveyGuide&&!['flower','dry','wood'].includes(step.scentProp))continue;
   const point=surveyPoint(quest,index,step.node);
   const [prop]=point.props;
   const position=step.surveyGuide??step;
   assert.deepEqual([prop.x,prop.y],[position.x,position.y]);
   const pose=JSON.parse(await readFile('assets/'+prop.file,'utf8'));
   await page.goto(new URL(surveyPointUrl(point),process.env.LAB_URL||'http://127.0.0.1:9125/').href);
   await page.waitForFunction(()=>window.mapArt?.ready&&mapArt.backgroundState==='ready');
   await page.locator('#compareSpriteProfiles').click();
   const rows=page.locator('#spriteProfileTable tbody tr');
   for(const [i,profile] of ['legacy','h48c32','h32c16'].entries()){
    const cells=await rows.nth(i).locator('td').allTextContents();
    assert.equal(Number(cells[1].replaceAll(',','')),rectangleCount(pose.profiles[profile]),prop.name);
    assert(parseFloat(cells[2])>0,prop.name);
    if(i===2)console.log(step.node,prop.name,cells.slice(1).join(' / '));
   }
  }
 }
}finally{await browser.close()}
