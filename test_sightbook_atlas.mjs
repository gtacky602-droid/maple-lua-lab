import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {atlasQuestObjectives} from './quest-journal.js';

const graph=JSON.parse(await readFile('content/story-graph.json','utf8'));
const q=graph.quests.find(q=>q.sights);
const state={status:'active',count:0,sights:{seen:{}}};
const frame={storyGraph:graph,story:{node:q.hub,quests:{[q.id]:state}}};
const ids=()=>atlasQuestObjectives(frame,q,q.target).flatMap(o=>o.points)
 .map(p=>new URL(p.url,'http://localhost').searchParams.get('worksite'));
for(const place of q.sights.places){
 assert.deepEqual(ids(),q.sights.places.filter(p=>!state.sights.seen[p.id]).map(p=>p.id));
 state.sights.seen[place.id]=true;
 state.count++;
}
assert.deepEqual(ids(),[q.sights.bridge.id]);
state.count=q.goal;
assert.deepEqual(ids(),[]);
state.status='complete';
for(const place of [...q.sights.places,q.sights.bridge]){
 state.sights.favorite=place.id;
 assert.deepEqual(ids(),[place.id]);
}
const browser=await chromium.launch({channel:'chrome'});
try{
 const page=await browser.newPage();
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:19745/');
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#importSave').setInputFiles('work/inazuma-fresh-route/sightbook-bridge.json');
 await page.waitForFunction(()=>window.lab.frame.story.quests['ayaka-join']?.count===3);
 await page.locator('[data-quest="ayaka-join"]').getByRole('button',{name:'この依頼を追跡',exact:true}).click();
 await page.locator('#trackedQuestMap').click();
 await page.selectOption('#atlasField',q.target);
 const link=page.locator('#atlasQuestObjectives a[href*="worksite=bridge"]');
 await link.waitFor();
 const popup=page.waitForEvent('popup');
 await link.click();
 const map=await popup;
 await map.waitForFunction(()=>document.querySelector('#surveyPointNote')?.dataset.worksite==='bridge');
 console.log('PASS: sight progression, four favorites, live atlas bridge link and destination preview');
}finally{await browser.close()}
