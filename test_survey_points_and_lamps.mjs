import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {surveyPoint,surveyPointUrl} from './survey-point.js';
import {questRouteText} from './quest-route.js';
import {displayedTierHash} from './tools/browser_scenery_tier.mjs';
const read=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const graph=await read('content/story-graph.json'), nodes=new Map(graph.nodes.map(n=>[n.id,n]));
const base=process.env.LAB_URL || 'http://127.0.0.1:9117/';
const source='enkan-lamp-chamber-dark-v1.png',encoded=(await read('evidence/shadow-bridge-background-compression.json')).scenes[source];
const points=[];
for(const q of graph.quests)for(const [i,step] of (q.itinerary??[]).entries()){
 const p=surveyPoint(q,i,step.node);
 if(p){assert.equal(p.x,step.x);assert.equal(p.y,step.y??480);points.push(p)}
}
const cases=graph.nodes.filter(n=>n.localLight);
assert.equal(cases.length,3);
const browser=await chromium.launch({channel:'chrome',args:['--disable-accelerated-2d-canvas']});
try{
 const page=await browser.newPage({viewport:{width:1400,height:960}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 const pixel=async(p,x,y)=>p.evaluate(({x,y})=>['png','rect'].map(id=>Array.from(document.getElementById(id).getContext('2d').getImageData(x,y,1,1).data)),{x,y});
 const expected=(values,color)=>assert.deepEqual(values,[color,color]);
 const rooms=[],pictures=[];
 for(const room of cases){
  const exit=room.exits.find(e=>e.darkOnly);
  const params=new URLSearchParams({placements:'live',node:room.id,to:exit.to,gateX:exit.x,gateY:exit.y,tier:'4096',compare:'background'});
  await page.goto(base+'map-art.html?'+params);
  await page.waitForFunction(s=>window.mapArt?.backgroundFile===s&&window.mapArt.decodedBackgroundRectangles===4096,source);
  assert.equal(await page.locator('#lampMode').inputValue(),'dark');
  let camera=Number(await page.locator('#camera').inputValue());
  expected(await pixel(page,exit.x-camera,exit.y-8),[255,230,128,255]);
  const rgb=[];
  for(const {rectangles,rgbSha256} of encoded.tiers){
   await page.selectOption('#backgroundTier',String(rectangles));
   await page.waitForFunction(n=>window.mapArt.decodedBackgroundRectangles===n,rectangles);
   assert.equal(await displayedTierHash(page,rectangles),rgbSha256);
   const file=await page.locator('#sceneryDownload[download$="-'+rectangles+'.lua"]').getAttribute('download');
   assert.equal(file,'enkan-lamp-chamber-dark-'+rectangles+'.lua');rgb.push(rgbSha256);
  }
  const picture=()=>page.locator('#rect').evaluate(c=>c.toDataURL());
  const dark=await picture();
  const frame={story:{active:true,node:room.id,quests:{}},storyGraph:graph,progression:{level:200},active:1,actors:[{id:1,x:exit.x,y:480}]};
  const visit={id:'preview',kind:'visit',hub:room.id,target:exit.to};
  // Some lamps require a completed access quest to reach the destination.
  if(exit.requires)frame.story.quests[exit.requires.quest]={status:'complete',count:99};
  frame.storyLocalLight={mode:'bright'};
  assert.match(questRouteText(frame,visit,'active'),/左手の操作盤でG/);
  frame.storyLocalLight.mode='dark';
  assert.match(questRouteText(frame,visit,'active'),/影の足場へ跳び/);
  await page.selectOption('#lampMode','bright');
  await page.waitForFunction(()=>window.mapArt.backgroundFile==='enkan-lamp-chamber-background-v1.png' && window.mapArt.decodedBackgroundRectangles===6144);
  assert.notDeepEqual((await pixel(page,exit.x-camera,exit.y-8))[0],[255,230,128,255]);
  pictures.push({name:room.name,dark,bright:await picture()});
  await page.locator('#lampConsole').click();
  const c=room.localLight.controls.find(c=>!c.darkOnly);
  camera=Number(await page.locator('#camera').inputValue());
  expected(await pixel(page,c.x-camera,c.y-24),[255,242,180,255]);
  await page.selectOption('#lampMode','dark');
  await page.waitForFunction(s=>window.mapArt.backgroundFile===s&&window.mapArt.decodedBackgroundRectangles===6144,source);
  expected(await pixel(page,c.x-camera,c.y-24),[127,196,215,255]);
  await page.locator('#sceneryDetail summary').click();
  await page.waitForFunction(()=>document.querySelector('#detailLink').getAttribute('href')?.includes('light=dark'));
  const detail=new URL(await page.locator('#detailLink').getAttribute('href'),page.url());
  assert.equal(detail.searchParams.get('light'),'dark');assert.equal(detail.searchParams.get('to'),exit.to);
  rooms.push({node:room.id,exit:exit.to,bridge:room.localLight.bridge,console:c,tiers:rgb.length});
 }
 const game=await browser.newPage();
 game.on('pageerror',e=>errors.push(e.message));
 await game.goto(base);
 await game.waitForFunction(()=>window.lab?.frame);
 await game.locator('#importSave').setInputFiles('work/earned-paha-survey.json');
 await game.waitForFunction(()=>window.lab.frame.story?.quests?.['nod-mapped-paha-shadow']?.count===1);
 await game.locator('[data-quest="nod-mapped-paha-shadow"]').getByRole('button',{name:'この依頼を追跡',exact:true}).click();
 const track=game.locator('#trackedSurveyPoint');
 const target=points.find(p=>p.quest==='nod-mapped-paha-shadow'&&p.step===2);
 assert.equal(await track.getAttribute('href'),surveyPointUrl(target));
 const [marker]=await Promise.all([game.waitForEvent('popup'),track.click()]);
 await marker.waitForFunction(n=>window.mapArt?.ready && window.mapArt.node===n,target.node);
 assert.ok((await marker.locator('#surveyPointNote').innerText()).includes(target.name));
 const camera=Number(await marker.locator('#camera').inputValue());
 expected(await pixel(marker,target.x-camera,target.y),[133,255,223,255]);
 await marker.close();
 for(const p of points){
  await page.selectOption('#node',p.node);
  await page.waitForFunction(n=>window.mapArt?.node===n && window.mapArt.backgroundState==='ready',p.node);
  const panel=page.locator('#localQuestSteps');
  if(!await panel.evaluate(el=>el.open))await panel.locator('summary').click();
  await panel.locator('a[href="'+surveyPointUrl(p)+'"]').click();
  const view=Number(await page.locator('#camera').inputValue());
  expected(await pixel(page,p.x-view,p.y),[133,255,223,255]);
 }
 const sheet=await page.evaluate(async rows=>{
  const c=document.createElement('canvas');c.width=984;c.height=35+rows.length*305;
  const ctx=c.getContext('2d');ctx.fillStyle='#152a31';ctx.fillRect(0,0,c.width,c.height);
  ctx.fillStyle='#f5f0dc';ctx.font='bold 17px "Yu Gothic UI",sans-serif';
  ctx.fillText('点灯中',8,23);ctx.fillText('消灯後の足場と出口',500,23);
  for(const [i,row] of rows.entries()){
   const y=37+i*305;ctx.fillText(row.name,8,y+18);
   for(const [j,url] of [row.bright,row.dark].entries()){
    const img=new Image();img.src=url;await img.decode();ctx.drawImage(img,8+j*490,y+24,480,270);
   }
  }
  return c.toDataURL();
 },pictures);
 await fs.writeFile('evidence/survey-lamp-comparison.png',Buffer.from(sheet.split(',')[1],'base64'));
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/survey-points-and-lamps-browser.json',JSON.stringify({rooms,trackedPoint:target,points:points.length,quests:new Set(points.map(p=>p.quest)).size},null,2)+'\n');
 console.log(rooms.length+' light rooms, '+points.length+' survey targets and a tracked-quest link passed');
}finally{await browser.close();}
