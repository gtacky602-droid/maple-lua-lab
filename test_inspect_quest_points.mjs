import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {surveyPoint,surveyPointUrl} from './survey-point.js';

const graph=JSON.parse(await readFile('content/story-graph.json'));
let covered=0,branches=0;
for(const q of graph.quests)for(const [i,s] of (q.itinerary??[]).entries()){
 if(s.kind!=='inspect')continue;
 for(const site of [s,...s.alternatives??[]]){
  const marker=surveyPoint(q,i,site.node);
  if(!Number.isFinite(site.x)||!Number.isFinite(site.y)){assert.equal(marker,null);continue}
  assert.deepEqual([marker.node,marker.x,marker.y],[site.node,site.x,site.y]);
  const url=new URL(surveyPointUrl(marker),'http://localhost/');
  assert.equal(url.searchParams.get('step'),String(i+1));
  covered++;
  if(site!==s)branches++;
 }
}
const browser=await chromium.launch({channel:'chrome'});
try{
 const page=await browser.newPage();
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:9124');
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#importSave').setInputFiles('evidence/mond-orchard-mud-save.json');
 const id='mond-return-box-quest';
 await page.waitForFunction(id=>window.lab.frame.story?.quests?.[id]?.count===2,id);
 await page.locator('[data-quest="'+id+'"]').getByRole('button',{name:'この依頼を追跡',exact:true}).click();
 const track=page.locator('#trackedSurveyPoint');
 await track.waitFor();
 await page.locator('#trackedQuestMap').click();
 const link=page.locator('#atlasQuestPoint');
 await link.waitFor();
 const target=new URL(await link.evaluate(a=>a.href));
 assert.equal(target.searchParams.getAll('absent').length,3);
 target.searchParams.delete('absent');
 assert.equal(target.href,await track.evaluate(a=>a.href));
 const popup=page.waitForEvent('popup');
 await link.click();
 const map=await popup;
 await map.waitForFunction(()=>window.mapArt?.ready&&window.mapArt.backgroundState==='ready');
 assert.match(await map.locator('#surveyPointNote').innerText(),/跳ねた泥.*649, 399/);
 assert.match(await map.locator('#status').innerText(),/敵配置 0体/);
 const notes=map.locator('#localQuestSteps');
 if(!await notes.evaluate(n=>n.open))await notes.locator('summary').click();
 const q=graph.quests.find(q=>q.id===id);
 for(const [i,s] of q.itinerary.entries()){
  if(!s.returnClue&&!s.returnPickup)continue;
  await notes.locator('li[value="'+(i+1)+'"] a').click();
  await map.waitForFunction(step=>window.mapArt?.ready&&document.querySelector('#surveyPointNote').dataset.step===String(step),i+1);
  assert((await map.locator('#surveyPointNote').innerText()).includes(s.action));
  const key=s.returnClue?.art??'crate';
  assert(await map.evaluate(key=>performance.getEntriesByType('resource').some(e=>e.name.endsWith('/quest-packed/mond-return-box-'+key+'-sprites-v1.json')),key));
  if(key==='mud')await map.locator('#rect').screenshot({path:'evidence/mond-orchard-mud-map.png'});
 }
 const flag=graph.quests.find(q=>q.id==='natlan-ridge-flag');
 for(const [i,step] of flag.itinerary.entries())for(const alt of step.alternatives??[]){
  const point=surveyPoint(flag,i,alt.node);
  await map.goto(new URL(surveyPointUrl(point),page.url()).href);
  await map.waitForFunction(()=>window.mapArt?.ready&&window.mapArt.backgroundState==='ready');
  const colors=await map.evaluate(({x,y})=>['png','rect'].map(id=>{
   const ctx=document.getElementById(id).getContext('2d');
   return Array.from(ctx.getImageData(x-window.mapArt.camera,y,1,1).data);
  }),point);
  assert.deepEqual(colors,[[133,255,223,255],[133,255,223,255]]);
 }
 await page.goto('about:blank');
 console.log(covered+' authored inspection locations; tracker, atlas, four packed orchard props and both alternate ledges passed.');
}finally{await browser.close()}
