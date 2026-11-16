import {chromium} from 'playwright';import fs from 'node:fs/promises';import assert from 'node:assert/strict';
import {trackedQuestText} from './quest-journal.js';
const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8')),q=graph.quests.find(q=>q.id==='mond-patrol');
const fixture={storyGraph:graph,story:{active:true,node:'mond-road',quests:{}}};
assert.match(trackedQuestText(fixture,q.id),/受注してください/);
fixture.story.quests[q.id]={status:'active',count:3};assert.match(trackedQuestText(fixture,q.id),/3\/8/);
fixture.story.quests[q.id].count=8;assert.match(trackedQuestText(fixture,q.id),/戻って報告/);
fixture.story.quests[q.id].status='complete';assert.match(trackedQuestText(fixture,q.id),/報酬受取済み/);
assert.equal(trackedQuestText({...fixture,storyGraph:{nodes:[],quests:[]}},q.id),'');
assert.equal(trackedQuestText({...fixture,story:{...fixture.story,active:false}},q.id),'');
const b=await chromium.launch({headless:true,channel:'chrome'}),p=await b.newPage({viewport:{width:1440,height:1000}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
try{
 await p.goto('http://127.0.0.1:8769');await p.waitForFunction(()=>window.lab?.frame);await p.getByRole('button',{name:'本編ルートへ',exact:true}).click();await p.waitForSelector('#questJournal');
 await p.locator('[data-quest="mond-patrol"]').getByRole('button',{name:'この依頼を追跡',exact:true}).click();await p.waitForSelector('#trackedQuest:visible');assert.match(await p.locator('#trackedQuestText').textContent(),/未受注/);
 await p.locator('[data-quest="mond-patrol"]').getByRole('button',{name:'受注',exact:true}).click();await p.waitForFunction(()=>document.getElementById('trackedQuestText').textContent.includes('進行中'));
 await p.selectOption('#questFilter','complete');assert.match(await p.locator('#trackedQuestText').textContent(),/0\/8/);
 await p.locator('#saveProgress').click();await p.waitForFunction(()=>document.getElementById('saveStatus').textContent.includes('保存しました'));
 await p.reload();await p.waitForFunction(()=>window.lab?.frame);assert.equal(await p.locator('#trackedQuest').isVisible(),false);await p.click('#loadProgress');await p.waitForSelector('#trackedQuest:visible');assert.match(await p.locator('#trackedQuestText').textContent(),/街道の安全確認.*0\/8/);
 await p.locator('#trackedQuest').screenshot({path:'evidence/quest-tracking.png'});
 await p.setViewportSize({width:390,height:844});assert.equal(await p.locator('#trackedQuest').evaluate(el=>el.scrollWidth>el.clientWidth),false);
 await p.click('#clearTrackedQuest');assert.equal(await p.locator('#trackedQuest').isVisible(),false);assert.equal(await p.evaluate(()=>localStorage.getItem('maple-lua-lab-tracked-quest')),null);
 // Stale IDs must not leak a name or block the rest of the interface.
 await p.evaluate(()=>localStorage.setItem('maple-lua-lab-tracked-quest','unknown-id'));await p.reload();await p.waitForFunction(()=>window.lab?.frame);await p.click('#loadProgress');await p.waitForSelector('#questJournal');assert.equal(await p.locator('#trackedQuest').isVisible(),false);
 assert.deepEqual(errors,[]);await fs.writeFile('evidence/quest-tracking-test.json',JSON.stringify({liveSelectAccept:true,independentOfFilter:true,reloadResume:true,clear:true,unknownHidden:true,fixtureStatuses:['unaccepted','active','ready','complete','inactive','hidden'],mobileOverflow:false,errors},null,2));console.log('Quest tracking selection, live acceptance, reload/resume, clear and hidden-state fixtures passed');
}finally{await b.close()}
