import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {surveyPoint,surveyPointUrl} from './survey-point.js';
import {rectangleCount,spriteBounds} from './sprite-layers.js';

const graph=JSON.parse(await readFile('content/story-graph.json','utf8'));
const quest=graph.quests.find(q=>q.id==='sum-collei-guide');
const browser=await chromium.launch({channel:'chrome'});
try{
 const page=await browser.newPage();
 for(const [index,step] of quest.itinerary.entries()){
  const room=graph.nodes.find(n=>n.id===step.node);
  if(!room.colleiGuideQuest)continue;
  for(let choice=1;choice<=(step.choices?.length??1);choice++){
   const point=surveyPoint(quest,index,room.id,room,null,choice);
   const placements=point.props;
   assert.equal(placements.length,room.guideScene.guest?1:room.guideScene.rain?2:4);
   if(index===1)assert.deepEqual(placements.map(p=>!!p.guideLabel),[true,true,false,false]);
   if(index===2)assert.deepEqual(placements.map(p=>p.guideLabel.muted),[true,true,false,false]);
   await page.goto(new URL(surveyPointUrl(point),process.env.LAB_URL||'http://127.0.0.1:9125/').href);
   await page.waitForFunction(()=>window.mapArt?.ready&&mapArt.backgroundState==='ready');
   const camera=await page.evaluate(()=>mapArt.camera);
   const visible=[];
   for(const prop of placements){
    const pose=JSON.parse(await readFile('assets/'+prop.file,'utf8'));
    const box=spriteBounds(pose,prop.height),left=prop.x-camera+box.x;
    if(left<961&&left+box.width>-1)visible.push(pose);
   }
   await page.locator('#compareSpriteProfiles').click();
   const rows=page.locator('#spriteProfileTable tbody tr');
   for(const [i,key] of ['legacy','h48c32','h32c16'].entries()){
    const cells=await rows.nth(i).locator('td').allTextContents();
    assert.equal(Number(cells[1].replaceAll(',','')),visible.reduce((n,p)=>n+rectangleCount(p.profiles[key]),0));
    assert(parseFloat(cells[2])>0);
    if(i===2)console.log(point.name,cells.slice(1).join(' / '));
   }
  }
 }
}finally{await browser.close()}
