import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';
import {trackedQuest} from './quest-journal.js';

const graph=JSON.parse(await readFile('content/story-graph.json','utf8'));
const base=process.env.LAB_URL||'http://127.0.0.1:19743/';
const browser=await chromium.launch({channel:'chrome'});
try{
 const page=await browser.newPage();
 for(const vehicle of graph.nodes.filter(n=>n.voyage)){
  const ride=vehicle.voyage;
  const destination=graph.nodes.find(n=>n.id===ride.destination);
  const q={id:'test-arrival',name:'終点まで',kind:'visit',target:destination.id,hub:ride.source,goal:1};
  const frame={storyGraph:{...graph,quests:[...graph.quests,q]},story:{active:true,node:vehicle.id,quests:{[q.id]:{status:'active',count:0}}},progression:{level:200},voyage:{kind:ride.kind,elapsed:0,seconds:2}};
  const guide=trackedQuest(frame,q.id);
  const url=new URL(guide.gateUrl,base);
  assert.equal(url.searchParams.get('voyage'),vehicle.id);
  assert.equal(url.searchParams.get('node'),destination.id);
  assert.equal(guide.pointLabel,destination.name+'の到着位置を見る');
  await page.goto(url.href);
  await page.waitForFunction(()=>window.mapArt?.ready&&mapArt.backgroundState==='ready');
  const x=ride.arrivalX??160,y=ride.arrivalY??destination.swim?.entryY??480;
  assert((await page.locator('#context').innerText()).includes('旅人の到着位置（'+x+', '+y+'）'));
  for(const canvas of ['png','rect']){
   const marker=await page.evaluate(({canvas,x,y})=>{
    const data=document.getElementById(canvas).getContext('2d').getImageData(x-mapArt.camera-8,y-12,16,12).data;
    return data.some((v,i)=>i%4===0&&v===145&&data[i+1]===255&&data[i+2]===240);
   },{canvas,x,y});
   assert(marker,vehicle.id+' '+canvas);
  }
  console.log(vehicle.id,destination.id,x,y);
 }
 const id='white-pass-footwork',station='white-pass-station';
 const save=JSON.parse(await readFile('evidence/remaining-survey-save.json','utf8'));
 save.story.node='snezhnaya-hub';
 save.story.quests[id]={status:'active',count:0};
 await page.addInitScript(id=>localStorage.setItem('maple-lua-lab-tracked-quest',id),id);
 await page.goto(base);
 await page.waitForFunction(()=>window.lab?.frame,null,{timeout:90000});
 await page.locator('#importSave').setInputFiles({name:'station.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(save))});
 const drive=waypointDriver(page,Object.fromEntries(graph.nodes.map(node=>[node.id,node])));
 await drive.waitNode(save.story.node);
 await drive.cross('white-pass-coach');
 const landing=page.locator('#trackedRouteGate');
 await landing.filter({hasText:'終着駅の到着位置を見る'}).waitFor();
 const popup=page.waitForEvent('popup');
 await landing.click();
 const preview=await popup;
 await preview.waitForFunction(()=>window.mapArt?.ready);
 assert.equal(new URL(preview.url()).searchParams.get('node'),station);
 await preview.close();
 await drive.waitNode(station);
 await landing.waitFor({state:'hidden'});
 assert((await page.locator('#trackedSurveyPoint').getAttribute('href')).includes(station));
 console.log('Train quest shows its landing while riding and its practice platform after arrival.');

}finally{await browser.close()}
