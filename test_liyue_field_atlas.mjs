import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {atlasQuestObjectives,trackedQuest} from './quest-journal.js';

const graph=JSON.parse(await readFile('content/story-graph.json','utf8'));
const art=JSON.parse(await readFile('content/worksite-props.json','utf8')).worksites;
const browser=await chromium.launch({channel:'chrome',args:['--disable-accelerated-2d-canvas']});
try{
 const page=await browser.newPage();
 for(const [kind,list,flags] of [['cooking','ingredients','gathered'],['construction','surveys','surveyed'],['stone','marks','marked']]){
  const q=graph.quests.find(q=>q[kind]);
  const state={status:'active',count:0,[kind]:{[flags]:{}}};
  const frame={storyGraph:graph,story:{active:true,node:q.hub,quests:{[q.id]:state}},progression:{level:200}};
  const links=node=>atlasQuestObjectives(frame,q,node).flatMap(o=>o.points).map(p=>new URL(p.url,'http://127.0.0.1:19745/'));
  for(const site of q[kind][list]){
   assert(links(site.node).some(url=>url.searchParams.get('worksite')===site.id));
   state[kind][flags][site.id]=true;state.count++;
   assert(!links(site.node).some(url=>url.searchParams.get('worksite')===site.id));
  }
  if(kind==='cooking'){
   const market=q.cooking.marketStall;
   for(const opened of [false,true]){
    frame.story.quests[market.quest]={count:opened?market.count:market.count-1};
    const place=opened?market:q.cooking.stall;
    for(const flavor of [null,...q.cooking.flavors]){
     state.status=flavor?'complete':'active';state.count=flavor?q.goal:q.goal-1;
     state.cooking.flavor=flavor?.id;
     const [url]=links(q.hub);
     assert.equal(url.searchParams.get('stall'),opened?'market':'harbor');
     assert.equal(url.searchParams.get('flavor'),flavor?.id??null);
     assert.equal(new URL(trackedQuest(frame,q.id).pointUrl,url).href,url.href);
     await page.goto(new URL(url.pathname+url.search,process.env.LAB_URL||url.origin).href);
     await page.waitForFunction(()=>window.mapArt?.decodedBackgroundRectangles===4096);
     const note=await page.locator('#surveyPointNote').innerText();
     assert(note.includes(place.x+', '+place.y));
     if(flavor){
      assert(note.includes(flavor.name));
      const colors=await page.evaluate(({x,y})=>['png','rect'].map(id=>{
       const ctx=document.getElementById(id).getContext('2d');
       return [...ctx.getImageData(x-window.mapArt.camera+39,y-37,1,1).data].slice(0,3);
      }),place);
      const rgb=flavor.color.slice(1).match(/../g).map(v=>parseInt(v,16));
      assert.deepEqual(colors,[rgb,rgb]);
     }else assert(!note.includes('4矩形'));
    }
   }
   console.log('PASS both cooking locations before tasting and both saved flavors on both layers');
  }
  if(kind==='construction'){
   const check=async (node,id)=>{
    const [url]=links(node);
    assert.equal(url.searchParams.get('worksite'),id);
    const tracked=new URL(trackedQuest(frame,q.id).pointUrl,url);
    assert.equal(tracked.searchParams.get('worksite'),id);
    assert.equal(tracked.searchParams.get('node'),node);
    await page.goto(new URL(url.pathname+url.search,process.env.LAB_URL||url.origin).href);
    await page.waitForFunction(id=>window.mapArt?.decodedBackgroundRectangles===4096&&document.querySelector('#surveyPointNote')?.dataset.worksite===id,id);
    assert((await page.locator('#surveyPointNote').innerText()).includes(art[q.id][id].length+'矩形'));
   };
   await check(q.construction.desk.node,'work-plan');
   for(const plan of q.construction.plans){
    state.construction.plan=plan.id;
    state.count=4;
    await check(plan.site.node,'work-clearing');
    state.count=5;
    await check(plan.site.node,'work-supplies');
   }
   console.log('PASS desk, both build sites and material deliveries');
  }
  if(kind!=='stone')continue;
  for(const site of [q.stone.mural,q.stone.model]){
   const [url]=links(q.target);
   assert.equal(url.searchParams.get('worksite'),site.id);
   assert.equal(new URL(trackedQuest(frame,q.id).pointUrl,url).searchParams.get('worksite'),site.id);
   await page.goto(new URL(url.pathname+url.search,process.env.LAB_URL||url.origin).href);
   await page.waitForFunction(id=>window.mapArt?.decodedBackgroundRectangles===4096&&document.querySelector('#surveyPointNote')?.dataset.worksite===id,site.id);
   const sample=art[q.id][site.id][0];
   const colors=await page.evaluate(({site,sample})=>['png','rect'].map(id=>{
    const ctx=document.getElementById(id).getContext('2d');
    return [...ctx.getImageData(site.x-window.mapArt.camera+sample[0]+1,site.y+sample[1]+1,1,1).data].slice(0,3);
   }),{site,sample});
   const rgb=sample[4].slice(1).match(/../g).map(x=>parseInt(x,16));
   assert.deepEqual(colors,[rgb,rgb]);
   console.log(site.name,art[q.id][site.id].length,'rectangles',colors);
   state.count++;
  }
 }
 console.log('PASS all nine field sites and both stone quest stages');
}finally{await browser.close()}
