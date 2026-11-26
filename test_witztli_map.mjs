import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {atlasQuestObjectives,trackedQuest} from './quest-journal.js';

const graph=JSON.parse(await readFile('content/story-graph.json','utf8'));
const quest=graph.quests.find(q=>q.id==='natlan-witztli-three-echoes');
const bank=graph.nodes.find(n=>n.id===quest.target);
const state={status:'active',count:1,pathProgress:{}};
const frame={storyGraph:graph,story:{active:true,node:bank.id,quests:{[quest.id]:state}},progression:{level:200}};
const base=process.env.LAB_URL??'http://127.0.0.1:19745/';
const browser=await chromium.launch({channel:'chrome'});
try{
 const page=await browser.newPage();
 async function open(url){
  await page.goto(new URL(url,base).href);
  await page.waitForFunction(()=>window.mapArt?.ready&&mapArt.backgroundState==='ready');
 }
 for(const path of quest.paths){
  const step=path.steps[0];
  frame.story.node=step.node;
  state.pathProgress[path.id]={count:0};
  const [inspect]=atlasQuestObjectives(frame,quest,step.node);
  await open(inspect.points[0].url);
  for(const id of ['png','rect']){
   const ink=await page.locator('#'+id).evaluate((c,p)=>Array.from(c.getContext('2d').getImageData(p.x-mapArt.camera,p.y-30,1,1).data).slice(0,3).join(','),step);
   assert.equal(ink,step.outcrop==='partial'?'83,110,145':'129,153,175');
  }
  state.pathProgress[path.id].count=1;
  const [escort]=atlasQuestObjectives(frame,quest,step.node);
  assert.equal(trackedQuest(frame,quest.id).pointUrl,escort.points[0].url);
  await open(escort.points[0].url);
  assert.equal(await page.locator('#gatePreview option:checked').getAttribute('data-to'),bank.id);
 }
 for(let mask=0;mask<8;mask++){
  for(const [i,path] of quest.paths.entries())state.pathProgress[path.id].count=mask&(1<<i)?2:0;
  state.count=mask===7?2:1;
  const objective=atlasQuestObjectives(frame,quest,bank.id).find(o=>o.text.startsWith('大岩に戻った光'));
  await open(objective.points[0].url);
  assert.equal(await page.locator('#fixtureState').isChecked(),mask===7);
  for(const [i,mark] of bank.spiritReturns.entries()){
   for(const id of ['png','rect']){
    const lit=await page.locator('#'+id).evaluate((c,m)=>{
     const x=m.x-mapArt.camera,y=Math.round(m.y-36+Math.sin(x*.026)*4);
     return Array.from(c.getContext('2d').getImageData(x,y,1,1).data).slice(0,3).join(',')==='220,255,235';
    },mark);
    assert.equal(lit,!!(mask&(1<<i)),mark.path);
   }
  }
  console.log(mask,objective.text);
 }
}finally{await browser.close()}
