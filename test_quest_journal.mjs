import {chromium} from 'playwright';import fs from 'node:fs/promises';
import {questStatus,questObjective} from './quest-journal.js';
const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const fields=JSON.parse((await fs.readFile('content/field-boss-spawns.json','utf8')).replace(/^\uFEFF/,'')).fieldBosses;
const weeklies=JSON.parse(await fs.readFile('content/weekly-boss-spawns.json','utf8')).weeklyBosses;
graph.bossNodes=Object.fromEntries([...fields,...weeklies].flatMap(spec=>
 [spec.id,spec.storyChallenge].filter(Boolean).map(target=>[target,spec.node])));
const stygian=JSON.parse(await fs.readFile('content/stygian-matches.json','utf8')).matches;
for(const spec of Object.values(stygian))graph.bossNodes[spec.challenge]=spec.node;
for(const q of graph.quests){
 const gated=Boolean(q.legacyOnly||q.requires||q.opensAfter||q.level!==undefined||q.growthRequirement);
 const prerequisites=Object.fromEntries([q.requires,q.opensAfter].filter(Boolean).map(id=>[id,{status:'complete',count:q.opensAfterCount??0}]));
 const growthEligibility=q.growthRequirement?{[q.growthRequirement]:true}:{};
 if(q.opensAfterAnyPath){
  const [path,count]=Object.entries(q.opensAfterAnyPath)[0];
  prerequisites[q.opensAfter].pathProgress={[path]:{count}};
 }
 if(questStatus(q,null,{},0)!==(gated?'locked':'unaccepted')||
    questStatus(q,null,prerequisites,Infinity,growthEligibility)!==(q.legacyOnly?'locked':'unaccepted')||
    (q.growthRequirement&&questStatus(q,null,prerequisites)!=='locked')||
    questStatus(q,{status:'active',count:0})!=='active'||
    questStatus(q,{status:'active',count:q.goal})!=='ready'||
    questStatus(q,{status:'complete',count:q.goal})!=='complete')throw Error('status '+q.id);
 if(questObjective(q,graph).includes('未登録'))throw Error('missing destination '+q.id);
}
const detour=graph.quests.find(q=>q.id==='columbina-coast-detour');
if(questStatus(detour,null,{[detour.opensAfter]:{status:'active',count:1}},120)!=='locked'||
   questStatus(detour,null,{[detour.opensAfter]:{status:'active',count:2}},120)!=='unaccepted')throw Error('first meeting requirement');
const springs=graph.quests.find(q=>q.id==='natlan-xilonen-springs');
const paths=pathProgress=>({[springs.opensAfter]:{status:'active',count:1,pathProgress}});
for(const [path,count] of Object.entries(springs.opensAfterAnyPath)){
 if(questStatus(springs,null,paths({[path]:{count}}),100)!=='unaccepted'||
    questStatus(springs,null,paths({[path]:{count:count-1}}),100)!=='locked')throw Error('single branch requirement '+path);
}
const b=await chromium.launch({headless:true,channel:'chrome'}),p=await b.newPage({viewport:{width:1200,height:1000}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
try{
 await p.goto(process.env.LAB_URL||'http://127.0.0.1:8769');await p.waitForFunction(()=>window.lab?.frame);
 await p.getByRole('button',{name:'本編ルートへ',exact:true}).click();await p.waitForSelector('#questFilter');
 const visibleCount=await p.evaluate(()=>window.lab.frame.storyGraph.quests.length);
 const frost=await p.evaluate(()=>window.lab.frame.storyGraph.bossNodes?.['cryo-hypostasis']);
 if(frost!==graph.bossNodes['cryo-hypostasis'])throw Error('field objective route missing from the live graph');
 const beidou=await p.evaluate(()=>window.lab.frame.storyGraph.bossNodes?.['stygian-beidou']);
 if(beidou!==graph.bossNodes['stygian-beidou'])throw Error('Stygian objective route missing from the live graph');
 await p.selectOption('#questFilter','all');if(await p.locator('#questJournal [data-quest]').count()!==visibleCount)throw Error('visible quest count');
 await p.selectOption('#questFilter','active');if(!(await p.locator('#questJournal').textContent()).includes('当てはまる依頼はありません'))throw Error('empty');
 await p.selectOption('#questFilter','relevant');await p.locator('[data-quest="mond-patrol"]').getByRole('button',{name:'受注',exact:true}).click();await p.waitForSelector('[data-quest="mond-patrol"][data-status="active"]');
 await p.selectOption('#questFilter','active');if(await p.locator('#questJournal [data-quest]').count()!==1)throw Error('active filter');
 // Render an explicit fixture independently of live Lua: verify report-ready and remote/repeatable states.
 const result=await p.evaluate(async graph=>{
  const {renderQuestJournal}=await import('./quest-journal.js');const calls=[];
  const repeat=graph.quests.find(q=>q.repeatable),ready=graph.quests.find(q=>q.id==='mond-patrol');
  const paid=graph.quests.find(q=>q.id==='amber-join');
  const quests={[ready.id]:{status:'active',count:ready.goal},[repeat.id]:{status:'complete',count:repeat.goal,cycles:2},
   [paid.id]:{status:'complete',count:paid.goal,cycles:1}};
  const f={storyGraph:graph,story:{node:'sumeru-entry',quests}},button=(label,action)=>{const b=document.createElement('button');b.textContent=label;b.onclick=()=>calls.push(action);return b};
  const section=renderQuestJournal(f,{filter:'all',onFilter:()=>{},button});section.id='journalFixture';document.body.append(section);
  const report=section.querySelector(`[data-quest="${ready.id}"] button`),accept=section.querySelector(`[data-quest="${repeat.id}"] button`);
  if(section.querySelector('[data-quest="amber-join"]').textContent.includes('仮報酬'))throw Error('paid record shows prospective reward');
  if(!report.disabled||!accept.disabled)throw Error('remote actions enabled');report.click();if(calls.length)throw Error('remote action fired');
  f.story.node=ready.hub;const local=renderQuestJournal(f,{filter:'ready',onFilter:()=>{},button});const localButton=local.querySelector('button');if(localButton.disabled)throw Error('local report disabled');localButton.click();
  return {remoteDisabled:true,localReport:calls[0],repeatCycles:section.querySelector(`[data-quest="${repeat.id}"]`).textContent.includes('報告2回')};
 },graph);
 if(result.localReport!=='story_report:mond-patrol'||!result.repeatCycles)throw Error('fixture');
 await p.locator('#questJournal').screenshot({path:'evidence/quest-journal.png'});
 await p.locator('#journalFixture [data-quest="mond-patrol"]').screenshot({path:'evidence/quest-journal-fixture.png'});
 await p.setViewportSize({width:390,height:844});const overflow=await p.locator('#journalFixture').evaluate(el=>el.scrollWidth>el.clientWidth);if(overflow)throw Error('journal mobile overflow');if(errors.length)throw Error(errors.join('/'));
 await fs.writeFile('evidence/quest-journal-test.json',JSON.stringify({questCount:graph.quests.length,visibleCount,allObjectivesResolved:true,stygianRoute:true,paidPreviewHidden:true,liveAcceptance:true,filters:true,fixture:result,mobileOverflow:overflow,errors},null,2));console.log('Quest journal statuses, objectives, filters, live accept and explicit report fixture passed');
}finally{await b.close()}
