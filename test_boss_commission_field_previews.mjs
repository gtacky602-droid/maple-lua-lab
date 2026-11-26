import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {trackedQuest,atlasQuestObjectives} from './quest-journal.js';
import {questTargetNode} from './quest-route.js';

const base=process.env.LAB_URL??'http://127.0.0.1:19743/';
const browser=await chromium.launch({channel:'chrome'});
try{
 const game=await browser.newPage();
 await game.goto(base);
 await game.waitForFunction(()=>window.lab?.frame);
 await game.evaluate(raw=>localStorage.setItem('maple-lua-lab.checkpoint.v1',raw),await readFile('evidence/remaining-survey-save.json','utf8'));
 await game.locator('#loadProgress').click();
 await game.waitForFunction(()=>window.lab?.frame.story?.active);
 const graph=await game.evaluate(()=>lab.frame.storyGraph);
 await game.goto('about:blank');
 const commissions=graph.quests.filter(q=>q.kind==='boss');
 const results=[];
 async function inspect(quests){
  const page=await browser.newPage();
  for(const q of quests){
   const node=questTargetNode(q,graph);
   const state={status:'active',count:0};
   const frame={storyGraph:graph,story:{active:true,node:q.hub,quests:{[q.id]:state}},progression:{level:200}};
   const guide=trackedQuest(frame,q.id);
   const [objective]=atlasQuestObjectives(frame,q,node);
   assert.equal(guide.pointUrl,objective.points[0].url,q.id);
   const url=new URL(guide.pointUrl,base);
   const arena=graph.bossNodes?.[q.target]??node;
   assert.equal(url.searchParams.get('node'),arena);
   await page.goto(url.href);
   await page.waitForFunction(()=>window.mapArt?.ready);
   const actors=await page.locator('#liveSubject option').evaluateAll(options=>options.map(o=>o.value).filter(Boolean));
   assert(actors.length,q.id);
   assert.equal(await page.locator('#liveSubject').inputValue(),'');
   await page.locator('#compareSpriteProfiles').click({timeout:5000});
   const counts=await page.locator('#spriteProfileTable tbody tr').evaluateAll(rows=>rows.map(r=>Number(r.cells[1].textContent.replaceAll(',',''))));
   assert(counts.length===3 && counts.every(count=>count>0),q.id);
   state.count=q.goal;
   assert.equal(trackedQuest(frame,q.id).node,q.hub);
   results.push({quest:q.id,node:arena,approach:node,actors,rectangles:counts});
  }
  await page.close();
 }
 await Promise.all([0,1,2].map(k=>inspect(commissions.filter((_,i)=>i%3===k))));
 assert.equal(results.length,commissions.length);
 await writeFile('evidence/boss-commission-field-previews.json',JSON.stringify(results.sort((a,b)=>a.quest.localeCompare(b.quest)),null,2)+'\n');
 console.log(results.length,'boss commissions measured and report destinations verified.');
}finally{await browser.close()}
