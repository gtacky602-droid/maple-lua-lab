import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {surveyPoint,surveyPointUrl} from './survey-point.js';
import {trackedQuest,atlasQuestObjectives} from './quest-journal.js';
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
 const state={status:'complete',count:quest.goal};
 const frame={story:{active:true,node:quest.hub,quests:{[quest.id]:state}},storyGraph:graph,progression:{level:120}};
 for(const [saved,stage,place] of [[null,'pickup',quest.guideLetter.sender],['held','delivery',quest.guideLetter.recipient],['delivered','reply',quest.guideLetter.recipient]]){
  state.colleiLetter=saved;
  const tracked=trackedQuest(frame,quest.id);
  const [objective]=atlasQuestObjectives(frame,quest,place.node);
  assert.equal(tracked.node,place.node);
  assert.equal(tracked.pointUrl,objective.points[0].url);
  assert.equal(atlasQuestObjectives(frame,quest,place.node===quest.hub?quest.guideLetter.recipient.node:quest.hub).length,0);
  const url=new URL(tracked.pointUrl,process.env.LAB_URL||'http://127.0.0.1:9125/');
  assert.equal(url.searchParams.get('letter'),stage);
  await page.goto(url.href);
  await page.waitForFunction(()=>window.mapArt?.ready&&mapArt.backgroundState==='ready');
  const note=await page.locator('#surveyPointNote').innerText();
  assert(note.includes(objective.text)&&note.includes(String(place.x)));
  if(stage!=='reply'){
   await page.locator('#compareSpriteProfiles').click();
   const cells=await page.locator('#spriteProfileTable tbody tr').last().locator('td').allTextContents();
   const pose=JSON.parse(await readFile('assets/quest-packed/sum-collei-guide-letter-sprites-v1.json','utf8'));
   assert.equal(Number(cells[1].replaceAll(',','')),rectangleCount(pose.profiles.h32c16));
  }
  console.log(stage,note);
 }
}finally{await browser.close()}
