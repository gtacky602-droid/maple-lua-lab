import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';

const samples=JSON.parse(await readFile('evidence/sayu-patrol-samples.json'));
const graph=JSON.parse(await readFile('content/story-graph.json'));
const quest=graph.quests.find(q=>q.id==='ina-sayu-quiet-route');
const browser=await chromium.launch({channel:'chrome'});
try{
 const page=await browser.newPage();
 const errors=[];
 page.on('pageerror',err=>errors.push(err.message));
 await page.addInitScript(()=>{
  window.edges={};window.watchers=0;
  const draw=CanvasRenderingContext2D.prototype.drawImage;
  CanvasRenderingContext2D.prototype.drawImage=function(img,...args){
   if(this.canvas.id==='png'&&img.src?.includes('nobushi'))window.watchers++;
   return draw.call(this,img,...args);
  };
  const fill=CanvasRenderingContext2D.prototype.fillRect;
  CanvasRenderingContext2D.prototype.fillRect=function(x,y,w,h){
   if(this.fillStyle==='#ffe19e'&&w===2&&h===84)window.edges[this.canvas.id]=[x+1,y];
   return fill.call(this,x,y,w,h);
  };
 });
 let checked=0;
 for(const [i,s] of quest.itinerary.entries()){
  if(!s.cover)continue;
  const url=new URL('/map-art.html',process.env.LAB_URL||'http://127.0.0.1:9124');
  url.search=new URLSearchParams({node:s.node,placements:'live',quest:quest.id,step:i+1,patrol:1});
  await page.goto(url.href);
  await page.waitForFunction(()=>window.mapArt?.ready&&window.edges.rect);
  for(const [t,[x,direction]] of samples[s.stealthGuard.id].entries()){
   await page.getByRole('slider',{name:'巡回の時刻'}).evaluate((el,t)=>{
    window.edges={};window.watchers=0;el.value=t;el.dispatchEvent(new Event('input'));
   },t);
   const {camera,edges}=await page.evaluate(()=>({camera:window.mapArt.camera,edges:window.edges}));
   for(const canvas of ['png','rect']){
    assert(Math.abs(edges[canvas][0]+camera-x-direction*s.stealthGuard.range)<0.002);
    assert.equal(edges[canvas][1],s.y-42);
   }
   assert.equal(await page.evaluate(()=>window.watchers),1);
   checked++;
  }
  if(s.cover.art==='cave')await page.locator('#rect').screenshot({path:'evidence/sayu-cave-patrol-preview.png'});
  await page.getByLabel('見張りの巡回と視線を表示').uncheck();
  assert(await page.getByRole('slider',{name:'巡回の時刻'}).isDisabled());
 }
 assert.deepEqual(errors,[]);
 console.log(checked+' patrol views matched the Lua guard samples on both canvases.');
}finally{await browser.close()}
