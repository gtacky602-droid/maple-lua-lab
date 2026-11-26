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
 const bookQuest=graph.quests.find(q=>q.book);
 const {proof,markers,guards,cache}=bookQuest.book;
 const bookState={status:'active',count:0,book:{defeated:{}}};
 const bookFrame={storyGraph:graph,story:{active:true,node:proof.node,quests:{[bookQuest.id]:bookState}},progression:{level:200}};
 const objectives=node=>atlasQuestObjectives(bookFrame,bookQuest,node).flatMap(o=>o.points);
 for(const [stage,sites] of [[0,[proof]],[1,markers],[3,[cache]]]){
  bookState.count=stage;
  const node=stage===3?bookQuest.target:proof.node;
  bookFrame.story.node=node;
  const points=objectives(node);
  assert.deepEqual(points.map(p=>p.label),sites.map(s=>s.name));
  assert.equal(trackedQuest(bookFrame,bookQuest.id).pointUrl,points[0].url);
  for(const [i,point] of points.entries()){
   await page.goto(new URL(point.url,process.env.LAB_URL||'http://127.0.0.1:19745/').href);
   await page.waitForFunction(()=>window.mapArt?.decodedBackgroundRectangles===4096);
   const note=await page.locator('#surveyPointNote').innerText();
   assert(note.includes(sites[i].name)&&note.includes(sites[i].x+', '+sites[i].y));
   const drawn=sites.reduce((sum,s)=>sum+art[bookQuest.id][s.id].length,0);
   assert(note.includes(drawn+'矩形'));
  }
 }
 bookState.count=2;
 for(const id of guards){
  const points=objectives(bookQuest.target);
  assert.equal(points[0].subject,id);
  assert.equal(trackedQuest(bookFrame,bookQuest.id).pointUrl,points[0].url);
  const url=new URL(points[0].url,'http://localhost');
  assert.deepEqual(url.searchParams.getAll('absent'),Object.keys(bookState.book.defeated));
  bookState.book.defeated[id]=true;
 }
 console.log('PASS proof sheet, both landmarks, remaining guards and recovered crate');
 for(const q of graph.quests.filter(q=>q.book||q.stone)){
  const spec=q.book??q.stone,market=spec.marketStand;
  const state={count:q.goal,status:'active',stone:{marked:{}}};
  const frame={storyGraph:graph,story:{active:true,node:q.hub,quests:{[q.id]:state}},progression:{level:200}};
  const points=()=>atlasQuestObjectives(frame,q,q.hub).flatMap(o=>o.points);
  assert(!points().some(p=>p.url.includes('exhibit=')));
  state.status='complete';
  for(const opened of [false,true]){
   frame.story.quests[market.quest]={count:opened?market.count:market.count-1};
   const place=opened?market:spec.stand;
   const url=new URL(points()[0].url,process.env.LAB_URL||'http://127.0.0.1:19745/');
   assert.equal(url.searchParams.get('exhibit'),opened?'market':'harbor');
   assert.equal(new URL(trackedQuest(frame,q.id).pointUrl,url).href,url.href);
   await page.goto(url.href);
   await page.waitForFunction(()=>window.mapArt?.decodedBackgroundRectangles===4096);
   const runs=art[q.id][q.book?'read-stand':spec.model.id];
   const note=await page.locator('#surveyPointNote').innerText();
   assert(note.includes(place.x+', '+place.y)&&note.includes(runs.length+'矩形'));
   await page.evaluate(({runs,place})=>{
    const expected=new Map();
    for(const [dx,dy,w,h,color] of runs)for(let j=dy;j<dy+h;j++)for(let i=dx;i<dx+w;i++){
     if(Math.abs(i)>12||Math.abs(j)>12)expected.set((place.y+j)*960+place.x-window.mapArt.camera+i,color);
    }
    for(const id of ['png','rect']){
     const pixels=document.getElementById(id).getContext('2d').getImageData(0,0,960,540).data;
     for(const [offset,color] of expected){
      const i=offset*4;
      if(((pixels[i]<<16)+(pixels[i+1]<<8)+pixels[i+2])!==parseInt(color.slice(1),16))throw Error('Exhibit pixel '+offset);
     }
    }
   },{runs,place});
   console.log(q.id,place.x,place.y,runs.length,'rectangles');
  }
 }
 console.log('PASS all nine field sites and both stone quest stages');
}finally{await browser.close()}
