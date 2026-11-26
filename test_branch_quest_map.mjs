import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {surveyPoint,surveyPointUrl} from './survey-point.js';
import {atlasQuestObjectives} from './quest-journal.js';
import {questRoute} from './quest-route.js';

const graph=JSON.parse(await readFile('content/story-graph.json','utf8'));
const returnQuest=graph.quests.find(q=>q.id==='natlan-witztli-three-echoes');
const branch=returnQuest.paths[0],arrival=branch.steps[1];
const frame={storyGraph:graph,story:{active:true,node:arrival.from,quests:{[returnQuest.id]:{status:'active',count:1,pathProgress:{[branch.id]:{count:1}}}}},progression:{level:200}};
assert.equal(questRoute(frame,returnQuest,'active').node,arrival.node);
frame.story.node=arrival.node;
assert.equal(questRoute(frame,returnQuest,'active').node,arrival.from);
for(const q of graph.quests.filter(q=>q.paths)){
 const state={status:'active',count:q.itinerary.findIndex(step=>step.kind==='paths'),pathProgress:{}};
 const branchFrame={storyGraph:graph,story:{node:q.hub,quests:{[q.id]:state}}};
 for(const path of q.paths){
  for(const [count,step] of path.steps.entries()){
   state.pathProgress[path.id]={count};
   const label=path.label+'　'+step.objective;
   const dest=step.kind==='arrive'&&step.from?step.from:step.node;
   assert(atlasQuestObjectives(branchFrame,q,dest).some(o=>o.text===label));
   if(step.kind==='arrive' && step.from!==step.node)
    assert(!atlasQuestObjectives(branchFrame,q,step.node).some(o=>o.text===label));
  }
  state.pathProgress[path.id]={count:path.steps.length};
  assert(!atlasQuestObjectives(branchFrame,q,path.steps[0].node).some(o=>o.text.startsWith(path.label+'　')));
 }
}
const browser=await chromium.launch({channel:'chrome'});
try{
 const page=await browser.newPage();
 const base=process.env.LAB_URL??'http://127.0.0.1:9125/';
 await page.goto(base);
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#importSave').setInputFiles('evidence/natlan-high-second-target-save.json');
 const id='natlan-two-trials';
 await page.waitForFunction(id=>window.lab.frame.story?.quests?.[id]?.pathProgress?.high?.count===1,id);
 await page.locator('[data-quest="'+id+'"]').getByRole('button',{name:'この依頼を追跡',exact:true}).click();
 await page.locator('#trackedQuestMap').click();
 const link=page.locator('#atlasQuestPoint');
 await link.waitFor();
 assert.equal(await link.innerText(),'高台の調査位置を見る');
 const branchText=page.locator('#atlasQuestObjectives');
 assert.match(await branchText.innerText(),/高台　上段へ跳んで次の狩場を見下ろす/);
 await page.selectOption('#atlasField','natlan-river-float-run');
 await page.waitForFunction(()=>document.querySelector('#atlasQuestObjectives').textContent.includes('水辺　岸に止まる浮き台を確認する'));
 assert.doesNotMatch(await branchText.innerText(),/上段へ跳んで/);
 const waterPopup=page.waitForEvent('popup');
 await branchText.getByRole('link',{name:'水辺の乗り方ノートの位置を見る'}).click();
 const waterMap=await waterPopup;
 await waterMap.waitForFunction(()=>window.mapArt?.ready && window.mapArt.node==='natlan-river-float-run');
 assert.match(await waterMap.locator('#surveyPointNote').innerText(),/水辺の乗り方ノート/);
 assert.equal(new URL(waterMap.url()).searchParams.get('path'),'water');
 await waterMap.close();
 await page.locator('#worldAtlas').screenshot({path:'evidence/natlan-atlas-water-branch.png'});
 await page.selectOption('#atlasField','natlan-high-trial-steps');
 await link.waitFor();
 const popup=page.waitForEvent('popup');
 await link.click();
 const map=await popup;
 await page.goto('about:blank');
 await map.waitForFunction(()=>window.mapArt?.ready);
 assert.match(await map.locator('#surveyPointNote').innerText(),/上段の標的.*1044, 302/);
 assert.equal(new URL(map.url()).searchParams.get('path'),'high');
 let count=0;
 for(const q of graph.quests.filter(q=>q.paths))for(const path of q.paths){
  for(const [i,s] of path.steps.entries()){
   const point=surveyPoint(q,i,s.node,null,path.id);
   if(s.kind!=='inspect'){assert.equal(point,null);continue}
   assert.deepEqual([point.x,point.y],[s.x,s.y]);
   const url=surveyPointUrl(point);
   await map.goto(new URL(url,base).href);
   await map.waitForFunction(()=>window.mapArt?.ready&&window.mapArt.backgroundState==='ready');
   const panel=map.locator('#localQuestSteps');
   if(!await panel.evaluate(el=>el.open))await panel.locator('summary').click();
   const location=panel.locator('a[href="'+url+'"]');
   assert((await location.locator('..').innerText()).includes(path.label));
   await location.click();
   const colors=await map.evaluate(({x,y})=>['png','rect'].map(id=>[...document.querySelector('#'+id).getContext('2d').getImageData(x-window.mapArt.camera,y,1,1).data]),point);
   assert.deepEqual(colors,[[133,255,223,255],[133,255,223,255]]);
   if(q.id===id&&path.id==='high'&&i===1)await map.locator('#rect').screenshot({path:'evidence/natlan-high-second-target-map.png'});
   count++;
  }
 }
 await map.close();
 await page.goto(base);
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#importSave').setInputFiles('evidence/natlan-river-partial-sweep-save.json');
 await page.waitForFunction(id=>window.lab.frame.story?.quests?.[id]?.pathProgress?.water?.count===1,id);
 await page.waitForFunction(()=>document.getElementById('trackedSurveyPoint').textContent==='水辺の残りの敵を見る');
 await page.locator('#trackedQuestMap').click();
 await link.waitFor();
 assert.equal(await link.innerText(),'水辺の残りの敵を見る');
 const params=new URL(await link.evaluate(a=>a.href)).searchParams;
 assert.equal(params.get('subject'),'natlan-river-bank-2');
 assert(params.getAll('absent').includes('natlan-river-bank-1'));
 const targets=branchText.locator('a[href*="subject=natlan-river-bank"]');
 assert.deepEqual(await targets.allTextContents(),['討伐対象 2／3の位置を見る','討伐対象 3／3の位置を見る']);
 const lastPopup=page.waitForEvent('popup');
 await targets.last().click();
 const last=await lastPopup;
 await last.waitForFunction(()=>window.mapArt?.ready&&document.querySelector('#liveSubject').value==='natlan-river-bank-3');
 for(const profile of ['h48c32','h32c16']){
  await last.selectOption('#profile',profile);
  await last.waitForFunction(p=>window.mapArt?.profile===p,profile);
  assert.equal(await last.locator('#liveSubject').inputValue(),'natlan-river-bank-3');
  assert.equal(await last.evaluate(()=>window.mapArt.shownCount),1);
 }
 assert(!(await last.evaluate(()=>window.mapArt.placements.map(p=>p.id))).includes('natlan-river-bank-1'));
 await last.locator('#rect').screenshot({path:'evidence/natlan-river-third-target-16color.png'});
 await last.close();
 const targetPage=page.waitForEvent('popup');
 await link.click();const enemy=await targetPage;
 await enemy.waitForFunction(()=>window.mapArt?.ready&&document.querySelector('#liveSubject').value==='natlan-river-bank-2');
 await page.goto('about:blank');
 await enemy.close();
 await page.goto(base);await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#importSave').setInputFiles('evidence/nod-optional-coast-save.json');
 const optional='nod-moon-crossroads';
 await page.waitForFunction(id=>window.lab.frame.story?.quests?.[id]?.status==='complete',optional);
 await page.locator('#questFilter').selectOption('complete');
 await page.locator('[data-quest="'+optional+'"]').getByRole('button',{name:'この依頼を追跡',exact:true}).click();
 await page.locator('#trackedQuestMap').click();
 await link.waitFor();
 assert.equal(await link.innerText(),'海岸旧道の調査位置を見る');
 assert.match(await branchText.innerText(),/任意・海岸旧道　海岸旧道でフリンズ/);
 const coast=new URL(await link.evaluate(a=>a.href)).searchParams;
 assert.deepEqual([coast.get('path'),coast.get('node'),coast.get('step')],['coast','nod-lantern-shore','1']);
 await page.goto('about:blank');
 console.log(count+' branch inspection points, both saved paths, remaining enemy focus, directed return and optional post-report branch verified.');
}finally{await browser.close()}
