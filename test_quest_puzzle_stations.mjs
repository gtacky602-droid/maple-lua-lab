import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {surveyPoint,puzzleStep,surveyPointUrl} from './survey-point.js';

const graph=JSON.parse(await readFile('content/story-graph.json','utf8'));
const art=JSON.parse(await readFile('content/quest-puzzle-stations.json','utf8'));
const base=process.env.LAB_URL??'http://127.0.0.1:9125/';
const browser=await chromium.launch({channel:'chrome'});
try{
 const page=await browser.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base);
 await page.waitForFunction(()=>window.lab?.frame);
 const id='simulanka-open-page';
 await page.locator('#importSave').setInputFiles('evidence/simulanka-paper-panel-save.json');
 await page.waitForFunction(id=>window.lab.frame.story?.quests?.[id]?.count===1,id);
 await page.locator('[data-quest="'+id+'"]').getByRole('button',{name:'この依頼を追跡',exact:true}).click();
 await page.locator('#trackedQuestMap').click();
 const mapLink=page.locator('#atlasQuestPoint');
 await mapLink.waitFor();
 assert.equal(await mapLink.innerText(),'現在の折り方と足場を見る');
 const open=page.waitForEvent('popup');await mapLink.click();const map=await open;
 await page.goto('about:blank');
 const form=map.getByLabel('紙の形');
 await form.waitFor();
 const initial=await form.inputValue(),restore=map.getByRole('button',{name:'地図を開いた時の折り方に戻す'});
 assert.equal(initial,'1');assert.equal(await restore.isDisabled(),true);
 await form.selectOption('2');await restore.click();assert.equal(await form.inputValue(),initial);
 let stations=0,forms=0;
 for(const q of graph.quests)for(const [i,s] of (q.itinerary??[]).entries()){
  if(!puzzleStep(s))continue;
  const room=graph.nodes.find(n=>n.id===s.node),point=surveyPoint(q,i,s.node,room);
  const loaded=map.waitForResponse(r=>r.url().endsWith('quest-puzzle-stations.json')&&r.ok());
  await map.goto(new URL(surveyPointUrl(point),base).href);
  await loaded;
  const picker=map.getByLabel('操作場所');
  await picker.waitFor();
  assert.equal(await picker.locator('option').count(),point.stations.length);
  for(const [index,site] of point.stations.entries()){
   await picker.selectOption({index});
   await map.waitForFunction(({x,y})=>document.querySelector('#surveyPointNote').textContent.includes('（'+x+', '+y+'）')&&window.mapArt?.ready,site);
   const colors=await map.evaluate(({x,y})=>['png','rect'].map(id=>[...document.getElementById(id).getContext('2d').getImageData(x-window.mapArt.camera,y,1,1).data]),site);
   assert.deepEqual(colors,[[133,255,223,255],[133,255,223,255]]);
   if(s.shadowChoice)assert((await map.locator('figure:visible figcaption').allTextContents()).includes(site.name+'　'+art[s.node][index].view.line));
   for(const [j,form] of (site.forms??[]).entries()){
    await map.getByLabel('紙の形').selectOption(String(j+1));
    const shape=form.platforms?.[0]??form.wall;
    const jump=map.getByRole('button',{name:'できる足場を見る'});
    assert.equal(await jump.isEnabled(),!!shape);
    if(shape){
     await jump.click();
     const expected=[...site.color.slice(1).matchAll(/../g)].map(m=>parseInt(m[0],16));
     const rgb=await map.evaluate(({x,y,w})=>['png','rect'].map(id=>[...document.getElementById(id).getContext('2d').getImageData(Math.floor(x+w/2-window.mapArt.camera),y+2,1,1).data].slice(0,3)),shape);
     assert.deepEqual(rgb,[expected,expected]);
     if(s.node==='simulanka-fold-valley'&&index===0&&j===1)await map.locator('#rect').screenshot({path:'evidence/simulanka-folded-stairs-preview.png'});
     await map.getByRole('button',{name:'操作盤へ戻る'}).click();
     const camera=await map.locator('#camera').evaluate(el=>Number(el.value));
     assert.equal(camera,Math.round(Math.max(0,Math.min(room.width-960,site.x-480))));
    }
    if(form.wall){
     await map.getByRole('button',{name:'遮蔽の壁を見る'}).click();
     const rgb=await map.evaluate(({x,y,w,h})=>['png','rect'].map(id=>[...document.getElementById(id).getContext('2d').getImageData(Math.floor(x+w/2-window.mapArt.camera),Math.floor(y+h/2),1,1).data]),form.wall);
     assert.deepEqual(rgb,[[206,210,174,255],[206,210,174,255]]);
     await map.getByRole('button',{name:'操作盤へ戻る'}).click();
    }
    forms++;
   }
   stations++;
  }
 }
 assert.deepEqual(errors,[]);
 console.log(Object.keys(art).length+' puzzle rooms, '+stations+' stations, '+forms+' paper forms and the tracked Lua save verified.');
}finally{await browser.close()}
