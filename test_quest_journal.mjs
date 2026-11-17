import {chromium} from 'playwright';import fs from 'node:fs/promises';
import {questStatus,questObjective} from './quest-journal.js';
const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
for(const q of graph.quests){
 const gated=Boolean(q.requires||q.opensAfter||q.level!==undefined);
 const prerequisites=Object.fromEntries([q.requires,q.opensAfter].filter(Boolean).map(id=>[id,{status:'complete'}]));
 if(questStatus(q,null,{},0)!==(gated?'locked':'unaccepted')||
    questStatus(q,null,prerequisites)!=='unaccepted'||
    questStatus(q,{status:'active',count:0})!=='active'||
    questStatus(q,{status:'active',count:q.goal})!=='ready'||
    questStatus(q,{status:'complete',count:q.goal})!=='complete')throw Error('status '+q.id);
 if(questObjective(q,graph).includes('未登録'))throw Error('missing destination '+q.id);
}
const b=await chromium.launch({headless:true,channel:'chrome'}),p=await b.newPage({viewport:{width:1200,height:1000}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
try{
 await p.goto(process.env.LAB_URL||'http://127.0.0.1:8769');await p.waitForFunction(()=>window.lab?.frame);
 await p.getByRole('button',{name:'本編ルートへ',exact:true}).click();await p.waitForSelector('#questFilter');
 const visibleCount=await p.evaluate(()=>window.lab.frame.storyGraph.quests.length);
 await p.selectOption('#questFilter','all');if(await p.locator('#questJournal [data-quest]').count()!==visibleCount)throw Error('visible quest count');
 await p.selectOption('#questFilter','active');if(!(await p.locator('#questJournal').textContent()).includes('当てはまる依頼はありません'))throw Error('empty');
 await p.selectOption('#questFilter','relevant');await p.locator('[data-quest="mond-patrol"]').getByRole('button',{name:'受注',exact:true}).click();await p.waitForSelector('[data-quest="mond-patrol"][data-status="active"]');
 await p.selectOption('#questFilter','active');if(await p.locator('#questJournal [data-quest]').count()!==1)throw Error('active filter');
 // Render an explicit fixture independently of live Lua: verify report-ready and remote/repeatable states.
 const result=await p.evaluate(async graph=>{
  const {renderQuestJournal}=await import('./quest-journal.js');const calls=[];
  const repeat=graph.quests.find(q=>q.repeatable),ready=graph.quests.find(q=>q.id==='mond-patrol');
  const quests={[ready.id]:{status:'active',count:ready.goal},[repeat.id]:{status:'complete',count:repeat.goal,cycles:2}};
  const f={storyGraph:graph,story:{node:'sumeru-entry',quests}},button=(label,action)=>{const b=document.createElement('button');b.textContent=label;b.onclick=()=>calls.push(action);return b};
  const section=renderQuestJournal(f,{filter:'all',onFilter:()=>{},button});section.id='journalFixture';document.body.append(section);
  const report=section.querySelector(`[data-quest="${ready.id}"] button`),accept=section.querySelector(`[data-quest="${repeat.id}"] button`);
  if(!report.disabled||!accept.disabled)throw Error('remote actions enabled');report.click();if(calls.length)throw Error('remote action fired');
  f.story.node=ready.hub;const local=renderQuestJournal(f,{filter:'ready',onFilter:()=>{},button});const localButton=local.querySelector('button');if(localButton.disabled)throw Error('local report disabled');localButton.click();
  return {remoteDisabled:true,localReport:calls[0],repeatCycles:section.querySelector(`[data-quest="${repeat.id}"]`).textContent.includes('報告2回')};
 },graph);
 if(result.localReport!=='story_report:mond-patrol'||!result.repeatCycles)throw Error('fixture');
 await p.locator('#questJournal').screenshot({path:'evidence/quest-journal.png'});
 await p.locator('#journalFixture [data-quest="mond-patrol"]').screenshot({path:'evidence/quest-journal-fixture.png'});
 await p.setViewportSize({width:390,height:844});const overflow=await p.locator('#journalFixture').evaluate(el=>el.scrollWidth>el.clientWidth);if(overflow)throw Error('journal mobile overflow');if(errors.length)throw Error(errors.join('/'));
 await fs.writeFile('evidence/quest-journal-test.json',JSON.stringify({questCount:graph.quests.length,visibleCount,allObjectivesResolved:true,liveAcceptance:true,filters:true,fixture:result,mobileOverflow:overflow,errors},null,2));console.log('Quest journal statuses, objectives, filters, live accept and explicit report fixture passed');
}finally{await b.close()}
