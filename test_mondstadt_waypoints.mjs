import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const base=process.env.LAB_URL||'http://127.0.0.1:8962';
const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const nodes=Object.fromEntries(graph.nodes.map(node=>[node.id,node]));
const errors=[],journeys=[];
const browser=await chromium.launch({headless:true,channel:'chrome',args:['--disable-gpu']});
const p=await browser.newPage({viewport:{width:1200,height:960}});
p.on('pageerror',e=>errors.push(e.message));
const node=()=>p.evaluate(()=>window.lab.frame.story.node);
const actor=()=>p.evaluate(()=>{
 const f=window.lab.frame;
 return f.actors.find(a=>a.id===f.active);
});
const waitNode=id=>p.waitForFunction(id=>window.lab?.frame.story?.node===id,id);
const count=(id,n)=>p.waitForFunction(([id,n])=>window.lab.frame.story.quests[id]?.count===n,[id,n]);
const focusGame=()=>p.evaluate(()=>document.activeElement.blur());
const choices=p.locator('#storyWaypointDestination');
const waypointCount=p.locator('#storyWaypoints label');

async function walk(x){
 await focusGame();
 const start=(await actor()).x;
 if(Math.abs(start-x)<20)return;
 const key=start>x?'KeyA':'KeyD';
 await p.keyboard.down(key);
 try{
  await p.waitForFunction(([x,start])=>{
   const f=window.lab.frame;
   const a=f.actors.find(a=>a.id===f.active);
   return start>x?a.x<=x+15:a.x>=x-15;
  },[x,start],{timeout:12000});
 }finally{await p.keyboard.up(key)}
}

async function cross(id){
 const from=await node();
 const edge=nodes[from].exits.find(e=>e.to===id);
 assert.ok(edge,`No gate ${from} → ${id}`);
 await walk(edge.x);
 if(edge.y){
  await p.keyboard.down('Space');
  try{
   await p.waitForFunction(y=>{
    const f=window.lab.frame;
    return f.actors.find(a=>a.id===f.active).y===y;
   },edge.y,{timeout:5000});
  }finally{await p.keyboard.up('Space')}
 }
 await p.waitForFunction(id=>{
  const gate=window.lab.frame.storyNearbyPortal;
  return gate?.to===id&&gate.available;
 },id);
 await p.keyboard.press('KeyF');
 if(edge.boatSeconds||edge.liftSeconds){
  await p.waitForFunction(label=>window.lab.frame.storyLift?.destination===label,edge.rideLabel||nodes[id].name);
  const ride=await p.evaluate(()=>window.lab.frame.storyLift);
  assert.equal(Boolean(ride.boat),Boolean(edge.boatSeconds));
  assert.equal(await node(),from);
 }
 await waitNode(id);
 journeys.push([from,id,edge.boatSeconds?'boat':edge.liftSeconds?'lift':edge.y?'raised':'walk']);
}

async function warp(id){
 await choices.selectOption(id);
 await p.getByRole('button',{name:'ワープする',exact:true}).click();
 await waitNode(id);
}

const row=id=>p.locator(`[data-quest="${id}"]`);
async function accept(id){
 await row(id).getByRole('button',{name:'受注',exact:true}).click();
 await count(id,0);
}
async function report(id){
 await row(id).getByRole('button',{name:'報告',exact:true}).click();
 await p.waitForFunction(id=>window.lab.frame.story.quests[id]?.status==='complete',id);
}

try{
 await p.goto(base);
 await p.waitForFunction(()=>window.lab?.frame);
 await p.locator('#importSave').setInputFiles('work/mondstadt-waypoint-browser-save.json');
 await waitNode('mond-town');
 assert.match(await waypointCount.textContent(),/1 \/ 51/);
 assert.equal(await choices.locator('option[value="mond-wp-12"]').count(),0);
 const lake='mond-mapped-lakeside';
 await accept(lake);
 for(const [i,id] of ['mond-road','mond-wp-13','mond-wp-7','mond-wp-12'].entries()){
  await cross(id);
  await count(lake,i+1);
 }
 await walk(675);
 await p.keyboard.press('KeyG');
 await count(lake,5);
 const pin=await p.evaluate(()=>window.lab.frame.storyWaypoint);
 assert.equal(pin.id,'teyvat:12');
 assert.equal(pin.kind,'statue');
 assert.match(await waypointCount.textContent(),/5 \/ 51/);
 await walk(800);
 await p.locator('#game').screenshot({path:'evidence/mondstadt-waypoint-travel.png'});
 await cross('mond-wp-8');
 await cross('mond-wp-12');
 assert.equal((await actor()).y,370);
 await warp('mond-town');
 await report(lake);
 await warp('mond-road');
 await cross('dornman-camp');
 const islet='mond-mapped-islet';
 await accept(islet);
 await cross('mond-wp-95797');
 await cross('mond-wp-95803');
 await cross('mond-wp-95797');
 await count(islet,1);
 await cross('mond-wp-95799');
 await count(islet,2);
 await walk(675);
 await p.keyboard.press('KeyG');
 await count(islet,3);
 await cross('mond-wp-95797');
 await count(islet,4);
 await warp('dornman-camp');
 await report(islet);
 await p.locator('#saveProgress').click();
 await p.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('保存しました'));
 await p.reload();
 await p.waitForFunction(()=>window.lab?.frame);
 await p.locator('#loadProgress').click();
 await p.waitForFunction(([lake,islet])=>{
  const f=window.lab.frame;
  return f.story?.quests[lake]?.status==='complete'&&f.story?.quests[islet]?.status==='complete';
 },[lake,islet]);
 assert.match(await waypointCount.textContent(),/10 \/ 51/);
 await p.setViewportSize({width:390,height:844});
 const fits=await choices.evaluate(el=>el.clientWidth<=el.parentElement.clientWidth);
 assert.equal(fits,true);
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/mondstadt-waypoint-browser.json',JSON.stringify({
  journeys,journal:[lake,islet],restored:true,pin,visitedCount:10,mobileSelectorFits:true,pageErrors:errors
 },null,2)+'\n');
 console.log('Chrome passed walking, raised gate, lift, boat, quest reports, fast travel and save reload.');
}catch(error){
 console.error('Last completed crossings:',journeys);
 throw error;
}finally{await browser.close()}
