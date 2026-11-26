import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {atlasQuestObjectives,trackedQuest} from './quest-journal.js';

const graph=JSON.parse(await readFile('content/story-graph.json','utf8'));
const base=process.env.LAB_URL??'http://127.0.0.1:19743/';
const browser=await chromium.launch({channel:'chrome'});
try{
 const page=await browser.newPage(),journal=await browser.newPage(),measures=[];
 await journal.goto(base);
 await journal.waitForFunction(()=>window.lab?.frame);
 await journal.evaluate(raw=>localStorage.setItem('maple-lua-lab.checkpoint.v1',raw),await readFile('evidence/remaining-survey-save.json','utf8'));
 await journal.locator('#loadProgress').click();
 await journal.waitForSelector('#questFilter');
 for(const q of graph.quests){
  for(const [index,step] of (q.itinerary??[]).entries()){
   if(step.kind!=='boss')continue;
   const frame={storyGraph:graph,story:{node:step.node,active:true,quests:{[q.id]:{status:'active',count:index}}}};
   const [objective]=atlasQuestObjectives(frame,q,step.node);
   const guide=trackedQuest(frame,q.id);
   assert.equal(guide.pointUrl,objective.points[0].url,q.id);
   const url=new URL(guide.pointUrl,base);
   assert.equal(url.searchParams.get('subject'),step.boss);
   if(q.designId?.startsWith('Q-B')){
    await journal.selectOption('#questFilter','branch:'+q.designId.split('-')[1]);
    const record=journal.locator('[data-quest="'+q.id+'"] .expeditionStops');
    await record.locator('summary').click();
    assert.equal(await record.getByRole('link',{name:guide.pointLabel}).getAttribute('href'),guide.pointUrl);
   }
   await page.goto(url.href);
   await page.waitForFunction(()=>window.mapArt?.ready);
   assert.equal(await page.locator('#liveSubject').inputValue(),step.boss);
   await page.locator('#compareSpriteProfiles').click();
   const profiles=await page.locator('#spriteProfileTable tbody tr').evaluateAll(rows=>rows.map(r=>({
    profile:r.cells[0].querySelector('button').value,rectangles:Number(r.cells[1].textContent.replaceAll(',','')),
    overlap:r.cells[2].textContent,meanRgbError:r.cells[3].textContent})));
   assert.equal(profiles.length,3);
   assert(profiles.every(p=>p.rectangles>0 && parseFloat(p.overlap)>0),step.boss);
   measures.push({quest:q.id,boss:step.boss,node:step.node,profiles});
  }
 }
 assert.equal(measures.length,16);
 await writeFile('evidence/quest-boss-field-profiles.json',JSON.stringify(measures,null,2)+'\n');
 console.log(measures.length,'quest bosses and',measures.length*3,'visible profiles measured.');
}finally{
 await Promise.all(browser.contexts().flatMap(c=>c.pages()).map(p=>p.goto('about:blank').catch(()=>{})));
 await browser.close();
}
